import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { SupabaseService } from '../../services/supabase.service';
import { FormsModule } from '@angular/forms';
import jsPDF from 'jspdf';
import autoTable, { RowInput, CellHookData } from 'jspdf-autotable';
import { Chart, ChartConfiguration, ChartType, registerables } from 'chart.js';
import * as XLSX from 'xlsx';

// Register Chart.js components
Chart.register(...registerables);

// Custom interfaces for strongly typed table data
interface StoreTableRow {
  shop: string;
  route: string;
  storeName: string;
  storeCode: string;
}

interface DeliveryTimeRow {
  shop: string;
  time: string;
  route: string;
}

interface CommentRow {
  route: string;
  comment: string;
}

interface SelectedStore {
  deliveryIndex: number;
  storeIndex: number;
  storeData: any;
}

interface DayGroup {
  date: string;
  displayDate: string;
  updates: any[];
  isExpanded: boolean;
  selectedUpdates: Set<number>;
}

interface RouteAnalytics {
  route: string;
  averageDeliveryTime: string;
  totalDeliveries: number;
  outstandingDeliveries: number;
  problemRate: number;
  circleKDeliveries: number;
  starbucksDeliveries: number;
  circleKAvgTime: string;
  starbucksAvgTime: string;
}

interface DailyDeliveryData {
  date: string;
  displayDate: string;
  circleKAvgTime: number | null;
  starbucksAvgTime: number | null;
  circleKCount: number;
  starbucksCount: number;
}

@Component({
  selector: 'app-driver-updates',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './driver-updates.component.html',
  styleUrls: ['./driver-updates.component.scss']
})
export class DriverUpdatesComponent implements OnInit {
  driverUpdates: any[] = [];
  loading: boolean = true;
  selectedUpdate: any = null;
  startOfToday: string;
  endOfToday: string;
  page: number = 0;
  pageSize: number = 10;
  totalCount: number = 0;
  viewMode: 'list' | 'detail' = 'list';
  Math = Math;
  selectedStores: SelectedStore[] = [];
  selectedUpdates: Set<number> = new Set(); // Track selected updates by ID
  
  // New properties for day grouping
  dayGroups: DayGroup[] = [];
  dateRange: number = 7; // Show last 7 days by default
  startDate: string;
  endDate: string;

  // Analytics properties
  routeAnalytics: RouteAnalytics[] = [];
  dailyDeliveryData: DailyDeliveryData[] = [];
  deliveryTimeChart: Chart | null = null;
  problemRouteChart: Chart | null = null;
  weeklyTrendChart: Chart | null = null;
  showAnalytics: boolean = true;

  constructor(private supabaseService: SupabaseService) {
    // Set date range for the last 7 days
    const today = new Date();
    today.setHours(23, 59, 59, 999);
    this.endDate = today.toISOString();
    
    const weekAgo = new Date(today);
    weekAgo.setDate(weekAgo.getDate() - this.dateRange);
    weekAgo.setHours(0, 0, 0, 0);
    this.startDate = weekAgo.toISOString();
    
    // Keep the original today range for backward compatibility
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    this.startOfToday = todayStart.toISOString();
    
    const tomorrow = new Date(todayStart);
    tomorrow.setDate(tomorrow.getDate() + 1);
    this.endOfToday = tomorrow.toISOString();
  }

  ngOnInit(): void {
    this.loadUpdatesGroupedByDay();
  }

  async loadUpdatesGroupedByDay(): Promise<void> {
    this.loading = true;
    try {
      const { data, error } = await this.supabaseService.getSupabase()
        .from('driver_delivery_updates')
        .select('*, drivers(name, custom_id)')
        .gte('created_at', this.startDate)
        .lt('created_at', this.endDate)
        .order('created_at', { ascending: false });

      if (error) throw error;

      this.driverUpdates = data || [];
      this.groupUpdatesByDay();
      console.log('Loaded driver updates grouped by day:', this.dayGroups);
    } catch (error) {
      console.error('Error loading driver updates:', error);
      this.driverUpdates = [];
      this.dayGroups = [];
    } finally {
      this.loading = false;
    }
  }

  private groupUpdatesByDay(): void {
    const groups: { [key: string]: any[] } = {};
    
    // Group updates by date
    this.driverUpdates.forEach(update => {
      const date = new Date(update.created_at);
      const dateKey = date.toISOString().split('T')[0]; // YYYY-MM-DD format
      
      if (!groups[dateKey]) {
        groups[dateKey] = [];
      }
      groups[dateKey].push(update);
    });

    // Convert to DayGroup array and sort by date (newest first)
    this.dayGroups = Object.keys(groups)
      .sort((a, b) => new Date(b).getTime() - new Date(a).getTime())
      .map(dateKey => {
        const date = new Date(dateKey);
        const isToday = dateKey === new Date().toISOString().split('T')[0];
        const isYesterday = dateKey === new Date(Date.now() - 86400000).toISOString().split('T')[0];
        
        let displayDate: string;
        if (isToday) {
          displayDate = 'Today';
        } else if (isYesterday) {
          displayDate = 'Yesterday';
        } else {
          displayDate = date.toLocaleDateString('en-US', {
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric'
          });
        }

        return {
          date: dateKey,
          displayDate,
          updates: groups[dateKey],
          isExpanded: isToday, // Expand today's updates by default
          selectedUpdates: new Set<number>()
        };
      });

    // Calculate analytics after grouping
    this.calculateRouteAnalytics();
  }

  private calculateRouteAnalytics(): void {
    const routeData: { [route: string]: any } = {};
    const dailyData: { [date: string]: any } = {};

    // Process all updates to gather route statistics and daily data
    this.driverUpdates.forEach(update => {
      const route = update.route_name || 'Unknown Route';
      const updateDate = new Date(update.created_at).toISOString().split('T')[0];
      
      if (!routeData[route]) {
        routeData[route] = {
          route,
          dailyStats: {}, // Track daily statistics for weekly averaging
          dailyDeliveryTimes: {}, // Track daily delivery times for weekly averaging
          circleKDeliveries: 0,
          starbucksDeliveries: 0
        };
      }

      // Initialize daily stats for this route and date if not exists
      if (!routeData[route].dailyStats[updateDate]) {
        routeData[route].dailyStats[updateDate] = {
          totalDeliveries: 0,
          outstandingDeliveries: 0
        };
      }

      // Initialize daily delivery times for this route and date if not exists
      if (!routeData[route].dailyDeliveryTimes[updateDate]) {
        routeData[route].dailyDeliveryTimes[updateDate] = {
          circleKTimes: [],
          starbucksTimes: [],
          allTimes: []
        };
      }

      if (!dailyData[updateDate]) {
        dailyData[updateDate] = {
          date: updateDate,
          circleKTimes: [],
          starbucksTimes: []
        };
      }

      // Process last delivery times
      if (update.last_delivery_times) {
        Object.entries(update.last_delivery_times).forEach(([shop, time]) => {
          const timeStr = time as string;
          routeData[route].dailyDeliveryTimes[updateDate].allTimes.push(timeStr);
          
          // Check if it's Circle K or Starbucks
          const shopLower = shop.toLowerCase();
          if (shopLower.includes('circle k') || shopLower.includes('circlek')) {
            routeData[route].circleKDeliveries++;
            routeData[route].dailyDeliveryTimes[updateDate].circleKTimes.push(timeStr);
            dailyData[updateDate].circleKTimes.push(timeStr);
          } else if (shopLower.includes('starbucks')) {
            routeData[route].starbucksDeliveries++;
            routeData[route].dailyDeliveryTimes[updateDate].starbucksTimes.push(timeStr);
            dailyData[updateDate].starbucksTimes.push(timeStr);
          }
        });
      }

      // Process delivery data for outstanding deliveries (daily basis)
      if (update.delivery_data && Array.isArray(update.delivery_data)) {
        update.delivery_data.forEach((delivery: any) => {
          routeData[route].dailyStats[updateDate].totalDeliveries++;
          if (delivery.stores && delivery.stores.length > 0) {
            routeData[route].dailyStats[updateDate].outstandingDeliveries += delivery.stores.length;
          }
        });
      }
    });

    // Convert to RouteAnalytics array with weekly averaging
    this.routeAnalytics = Object.values(routeData).map((data: any) => {
      // Calculate weekly average delivery times
      const dailyDeliveryTimesArray = Object.values(data.dailyDeliveryTimes) as any[];
      const daysWithDeliveryData = dailyDeliveryTimesArray.length;
      
      let weeklyAvgDeliveryTime = 'N/A';
      let weeklyAvgCircleKTime = 'N/A';
      let weeklyAvgStarbucksTime = 'N/A';
      
      if (daysWithDeliveryData > 0) {
        // Calculate daily averages first, then average those for weekly average
        const dailyAvgTimes: number[] = [];
        const dailyAvgCircleKTimes: number[] = [];
        const dailyAvgStarbucksTimes: number[] = [];
        
        dailyDeliveryTimesArray.forEach((dayData: any) => {
          // Overall delivery times for the day
          if (dayData.allTimes.length > 0) {
            const dayAvg = this.calculateAverageTimeInMinutes(dayData.allTimes);
            dailyAvgTimes.push(dayAvg);
          }
          
          // Circle K times for the day
          if (dayData.circleKTimes.length > 0) {
            const dayAvg = this.calculateAverageTimeInMinutes(dayData.circleKTimes);
            dailyAvgCircleKTimes.push(dayAvg);
          }
          
          // Starbucks times for the day
          if (dayData.starbucksTimes.length > 0) {
            const dayAvg = this.calculateAverageTimeInMinutes(dayData.starbucksTimes);
            dailyAvgStarbucksTimes.push(dayAvg);
          }
        });
        
        // Calculate weekly averages from daily averages
        if (dailyAvgTimes.length > 0) {
          const weeklyAvgMinutes = dailyAvgTimes.reduce((sum, avg) => sum + avg, 0) / dailyAvgTimes.length;
          weeklyAvgDeliveryTime = this.convertMinutesToTimeString(weeklyAvgMinutes);
        }
        
        if (dailyAvgCircleKTimes.length > 0) {
          const weeklyAvgMinutes = dailyAvgCircleKTimes.reduce((sum, avg) => sum + avg, 0) / dailyAvgCircleKTimes.length;
          weeklyAvgCircleKTime = this.convertMinutesToTimeString(weeklyAvgMinutes);
        }
        
        if (dailyAvgStarbucksTimes.length > 0) {
          const weeklyAvgMinutes = dailyAvgStarbucksTimes.reduce((sum, avg) => sum + avg, 0) / dailyAvgStarbucksTimes.length;
          weeklyAvgStarbucksTime = this.convertMinutesToTimeString(weeklyAvgMinutes);
        }
      }
      
      // Calculate weekly averages for problem rate
      const dailyStatsArray = Object.values(data.dailyStats) as any[];
      const daysWithData = dailyStatsArray.length;
      
      let weeklyAvgTotalDeliveries = 0;
      let weeklyAvgOutstandingDeliveries = 0;
      let weeklyProblemRate = 0;
      
      if (daysWithData > 0) {
        // Calculate daily problem rates and then average them
        const dailyProblemRates = dailyStatsArray.map((dayStats: any) => {
          if (dayStats.totalDeliveries > 0) {
            return (dayStats.outstandingDeliveries / dayStats.totalDeliveries) * 100;
          }
          return 0;
        });
        
        // Weekly average problem rate
        weeklyProblemRate = dailyProblemRates.reduce((sum, rate) => sum + rate, 0) / daysWithData;
        
        // Weekly average deliveries
        weeklyAvgTotalDeliveries = dailyStatsArray.reduce((sum, dayStats) => sum + dayStats.totalDeliveries, 0) / daysWithData;
        weeklyAvgOutstandingDeliveries = dailyStatsArray.reduce((sum, dayStats) => sum + dayStats.outstandingDeliveries, 0) / daysWithData;
      }

      return {
        route: data.route,
        averageDeliveryTime: weeklyAvgDeliveryTime,
        totalDeliveries: Math.round(weeklyAvgTotalDeliveries * 10) / 10, // Round to 1 decimal
        outstandingDeliveries: Math.round(weeklyAvgOutstandingDeliveries * 10) / 10, // Round to 1 decimal
        problemRate: Math.round(weeklyProblemRate * 100) / 100, // Round to 2 decimals
        circleKDeliveries: data.circleKDeliveries,
        starbucksDeliveries: data.starbucksDeliveries,
        circleKAvgTime: weeklyAvgCircleKTime,
        starbucksAvgTime: weeklyAvgStarbucksTime
      };
    }).sort((a, b) => this.extractRouteNumber(a.route) - this.extractRouteNumber(b.route));

    // Convert to DailyDeliveryData array
    this.dailyDeliveryData = Object.keys(dailyData)
      .sort((a, b) => new Date(a).getTime() - new Date(b).getTime())
      .map(dateKey => {
        const data = dailyData[dateKey];
        const date = new Date(dateKey);
        const today = new Date().toISOString().split('T')[0];
        const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];
        
        let displayDate: string;
        if (dateKey === today) {
          displayDate = 'Today';
        } else if (dateKey === yesterday) {
          displayDate = 'Yesterday';
        } else {
          displayDate = date.toLocaleDateString('en-US', {
            weekday: 'short',
            month: 'short',
            day: 'numeric'
          });
        }

        return {
          date: dateKey,
          displayDate,
          circleKAvgTime: this.calculateAverageTimeInHours(data.circleKTimes),
          starbucksAvgTime: this.calculateAverageTimeInHours(data.starbucksTimes),
          circleKCount: data.circleKTimes.length,
          starbucksCount: data.starbucksTimes.length
        };
      });

    // Generate charts after calculation
    setTimeout(() => {
      this.generateDeliveryTimeChart();
      this.generateProblemRouteChart();
      this.generateWeeklyTrendChart();
    }, 100);
  }

  private calculateAverageTimeInMinutes(times: string[]): number {
    if (times.length === 0) return 0;

    const totalMinutes = times.reduce((sum, timeStr) => {
      const [hours, minutes] = timeStr.split(':').map(Number);
      return sum + (hours * 60) + minutes;
    }, 0);

    return totalMinutes / times.length;
  }

  private convertMinutesToTimeString(minutes: number): string {
    const hours = Math.floor(minutes / 60);
    const mins = Math.round(minutes % 60);
    return `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}`;
  }

  private calculateAverageTime(times: string[]): string {
    if (times.length === 0) return 'N/A';

    const totalMinutes = times.reduce((sum, timeStr) => {
      const [hours, minutes] = timeStr.split(':').map(Number);
      return sum + (hours * 60) + minutes;
    }, 0);

    const avgMinutes = Math.round(totalMinutes / times.length);
    const hours = Math.floor(avgMinutes / 60);
    const mins = avgMinutes % 60;
    
    return `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}`;
  }

  private calculateAverageTimeInHours(times: string[]): number | null {
    if (times.length === 0) return null;

    const totalMinutes = times.reduce((sum, timeStr) => {
      const [hours, minutes] = timeStr.split(':').map(Number);
      return sum + (hours * 60) + minutes;
    }, 0);

    const avgMinutes = totalMinutes / times.length;
    return avgMinutes / 60; // Convert to hours
  }

  private generateDeliveryTimeChart(): void {
    const canvas = document.getElementById('deliveryTimeChart') as HTMLCanvasElement;
    if (!canvas) return;

    // Destroy existing chart
    if (this.deliveryTimeChart) {
      this.deliveryTimeChart.destroy();
    }

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Show all routes, not just those with Circle K or Starbucks data
    const allRoutes = this.routeAnalytics;

    const labels = allRoutes.map(r => r.route);
    const circleKData = allRoutes.map(r => {
      if (r.circleKAvgTime === 'N/A') return null;
      const [hours, minutes] = r.circleKAvgTime.split(':').map(Number);
      return hours + (minutes / 60);
    });
    const starbucksData = allRoutes.map(r => {
      if (r.starbucksAvgTime === 'N/A') return null;
      const [hours, minutes] = r.starbucksAvgTime.split(':').map(Number);
      return hours + (minutes / 60);
    });

    this.deliveryTimeChart = new Chart(ctx, {
      type: 'bar',
      data: {
        labels,
        datasets: [
          {
            label: 'Circle K Weekly Avg Delivery Time',
            data: circleKData,
            backgroundColor: 'rgba(45, 140, 255, 0.7)',
            borderColor: 'rgba(45, 140, 255, 1)',
            borderWidth: 1,
            barThickness: 20,
            maxBarThickness: 25
          },
          {
            label: 'Starbucks Weekly Avg Delivery Time',
            data: starbucksData,
            backgroundColor: 'rgba(40, 167, 69, 0.7)',
            borderColor: 'rgba(40, 167, 69, 1)',
            borderWidth: 1,
            barThickness: 20,
            maxBarThickness: 25
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          title: {
            display: true,
            text: 'Weekly Average Delivery Times by Route (Circle K vs Starbucks)',
            font: { size: 16, weight: 'bold' }
          },
          legend: {
            position: 'top'
          }
        },
        scales: {
          y: {
            beginAtZero: true,
            title: {
              display: true,
              text: 'Hours'
            },
            ticks: {
              callback: function(value) {
                const hours = Math.floor(Number(value));
                const minutes = Math.round((Number(value) - hours) * 60);
                return `${hours}:${minutes.toString().padStart(2, '0')}`;
              }
            }
          },
          x: {
            title: {
              display: true,
              text: 'Routes'
            },
            ticks: {
              maxRotation: 45,
              minRotation: 0
            }
          }
        },
        layout: {
          padding: {
            left: 10,
            right: 10
          }
        }
      }
    });
  }

  private generateProblemRouteChart(): void {
    const canvas = document.getElementById('problemRouteChart') as HTMLCanvasElement;
    if (!canvas) return;

    // Destroy existing chart
    if (this.problemRouteChart) {
      this.problemRouteChart.destroy();
    }

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Show all routes, not just top 10 with problems
    const allRoutes = this.routeAnalytics
      .sort((a, b) => this.extractRouteNumber(a.route) - this.extractRouteNumber(b.route));

    const labels = allRoutes.map(r => r.route);
    const problemRates = allRoutes.map(r => r.problemRate);
    const outstandingCounts = allRoutes.map(r => r.outstandingDeliveries);

    // Generate colors based on problem severity
    const backgroundColors = problemRates.map(rate => {
      if (rate > 75) return 'rgba(220, 53, 69, 0.7)'; // Red for high problems
      if (rate > 50) return 'rgba(255, 193, 7, 0.7)'; // Yellow for medium problems
      if (rate > 25) return 'rgba(255, 152, 0, 0.7)'; // Orange for low-medium problems
      return 'rgba(40, 167, 69, 0.7)'; // Green for low problems
    });

    const borderColors = backgroundColors.map(color => color.replace('0.7', '1'));

    this.problemRouteChart = new Chart(ctx, {
      type: 'bar',
      data: {
        labels,
        datasets: [
          {
            label: 'Weekly Avg Problem Rate (%)',
            data: problemRates,
            backgroundColor: backgroundColors,
            borderColor: borderColors,
            borderWidth: 1,
            yAxisID: 'y',
            barThickness: 20,
            maxBarThickness: 25
          },
          {
            label: 'Weekly Avg Outstanding Deliveries',
            data: outstandingCounts,
            type: 'line',
            borderColor: 'rgba(45, 140, 255, 1)',
            backgroundColor: 'rgba(45, 140, 255, 0.1)',
            borderWidth: 2,
            fill: false,
            yAxisID: 'y1'
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          title: {
            display: true,
            text: 'Routes with Most Delivery Problems (Weekly Averages)',
            font: { size: 16, weight: 'bold' }
          },
          legend: {
            position: 'top'
          }
        },
        scales: {
          y: {
            type: 'linear',
            display: true,
            position: 'left',
            title: {
              display: true,
              text: 'Weekly Avg Problem Rate (%)'
            },
            beginAtZero: true,
            max: 100
          },
          y1: {
            type: 'linear',
            display: true,
            position: 'right',
            title: {
              display: true,
              text: 'Weekly Avg Outstanding Deliveries'
            },
            beginAtZero: true,
            grid: {
              drawOnChartArea: false,
            },
          },
          x: {
            title: {
              display: true,
              text: 'Routes'
            },
            ticks: {
              maxRotation: 45,
              minRotation: 0
            }
          }
        },
        layout: {
          padding: {
            left: 10,
            right: 10
          }
        }
      }
    });
  }

  private generateWeeklyTrendChart(): void {
    const canvas = document.getElementById('weeklyTrendChart') as HTMLCanvasElement;
    if (!canvas) return;

    // Destroy existing chart
    if (this.weeklyTrendChart) {
      this.weeklyTrendChart.destroy();
    }

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Prepare data for the line chart
    const labels = this.dailyDeliveryData.map(d => d.displayDate);
    const circleKData = this.dailyDeliveryData.map(d => d.circleKAvgTime);
    const starbucksData = this.dailyDeliveryData.map(d => d.starbucksAvgTime);

    this.weeklyTrendChart = new Chart(ctx, {
      type: 'line',
      data: {
        labels,
        datasets: [
          {
            label: 'Circle K Average Delivery Time',
            data: circleKData,
            borderColor: 'rgba(45, 140, 255, 1)',
            backgroundColor: 'rgba(45, 140, 255, 0.1)',
            borderWidth: 3,
            fill: false,
            tension: 0.4,
            pointBackgroundColor: 'rgba(45, 140, 255, 1)',
            pointBorderColor: '#fff',
            pointBorderWidth: 2,
            pointRadius: 6,
            pointHoverRadius: 8
          },
          {
            label: 'Starbucks Average Delivery Time',
            data: starbucksData,
            borderColor: 'rgba(40, 167, 69, 1)',
            backgroundColor: 'rgba(40, 167, 69, 0.1)',
            borderWidth: 3,
            fill: false,
            tension: 0.4,
            pointBackgroundColor: 'rgba(40, 167, 69, 1)',
            pointBorderColor: '#fff',
            pointBorderWidth: 2,
            pointRadius: 6,
            pointHoverRadius: 8
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          title: {
            display: true,
            text: 'Weekly Delivery Time Trends (Circle K vs Starbucks)',
            font: { size: 16, weight: 'bold' }
          },
          legend: {
            position: 'top'
          },
          tooltip: {
            callbacks: {
              label: function(context) {
                const value = context.parsed.y;
                if (value === null) return `${context.dataset.label}: No data`;
                const hours = Math.floor(value);
                const minutes = Math.round((value - hours) * 60);
                return `${context.dataset.label}: ${hours}:${minutes.toString().padStart(2, '0')}`;
              }
            }
          }
        },
        scales: {
          y: {
            beginAtZero: true,
            title: {
              display: true,
              text: 'Hours'
            },
            ticks: {
              callback: function(value) {
                const hours = Math.floor(Number(value));
                const minutes = Math.round((Number(value) - hours) * 60);
                return `${hours}:${minutes.toString().padStart(2, '0')}`;
              }
            }
          },
          x: {
            title: {
              display: true,
              text: 'Days'
            }
          }
        },
        elements: {
          line: {
            borderJoinStyle: 'round'
          }
        }
      }
    });
  }

  toggleAnalytics(): void {
    this.showAnalytics = !this.showAnalytics;
    if (this.showAnalytics) {
      setTimeout(() => {
        this.generateDeliveryTimeChart();
        this.generateProblemRouteChart();
      }, 100);
    }
  }

  // Helper methods for template calculations
  getTotalOutstandingDeliveries(): number {
    // Sum of weekly average outstanding deliveries across all routes
    return Math.round(this.routeAnalytics.reduce((sum, route) => sum + route.outstandingDeliveries, 0) * 10) / 10;
  }

  getRoutesWithCircleKOrStarbucks(): number {
    const circleKRoutes = this.routeAnalytics.filter(r => r.circleKDeliveries > 0).length;
    const starbucksRoutes = this.routeAnalytics.filter(r => r.starbucksDeliveries > 0).length;
    return circleKRoutes + starbucksRoutes;
  }

  getAverageProblemRate(): number {
    // Average of weekly problem rates across all routes
    if (this.routeAnalytics.length === 0) return 0;
    const totalProblemRate = this.routeAnalytics.reduce((sum, route) => sum + route.problemRate, 0);
    return Math.round(totalProblemRate / this.routeAnalytics.length);
  }

  toggleDayExpansion(dayGroup: DayGroup): void {
    dayGroup.isExpanded = !dayGroup.isExpanded;
  }

  toggleDaySelection(dayGroup: DayGroup): void {
    if (dayGroup.selectedUpdates.size === dayGroup.updates.length) {
      // All selected, deselect all
      dayGroup.selectedUpdates.clear();
    } else {
      // Not all selected, select all
      dayGroup.updates.forEach(update => {
        if (update.id) {
          dayGroup.selectedUpdates.add(update.id);
        }
      });
    }
  }

  toggleUpdateInDay(dayGroup: DayGroup, updateId: number): void {
    if (dayGroup.selectedUpdates.has(updateId)) {
      dayGroup.selectedUpdates.delete(updateId);
    } else {
      dayGroup.selectedUpdates.add(updateId);
    }
  }

  isUpdateSelectedInDay(dayGroup: DayGroup, updateId: number): boolean {
    return dayGroup.selectedUpdates.has(updateId);
  }

  isDayFullySelected(dayGroup: DayGroup): boolean {
    return dayGroup.selectedUpdates.size === dayGroup.updates.length && dayGroup.updates.length > 0;
  }

  isDayPartiallySelected(dayGroup: DayGroup): boolean {
    return dayGroup.selectedUpdates.size > 0 && dayGroup.selectedUpdates.size < dayGroup.updates.length;
  }

  getSelectedUpdatesFromAllDays(): any[] {
    const selectedUpdates: any[] = [];
    this.dayGroups.forEach(dayGroup => {
      dayGroup.updates.forEach(update => {
        if (dayGroup.selectedUpdates.has(update.id)) {
          selectedUpdates.push(update);
        }
      });
    });
    return selectedUpdates;
  }

  exportSelectedDays(): void {
    const selectedUpdates = this.getSelectedUpdatesFromAllDays();
    if (selectedUpdates.length === 0) {
      alert('Please select at least one update to export.');
      return;
    }
    
    this.exportMultipleUpdates(selectedUpdates);
  }

  exportMultipleUpdates(updates: any[]): void {
    if (updates.length === 0) {
      alert('No updates to export.');
      return;
    }
    
    try {
      const today = new Date().toLocaleDateString('en-US', { 
        year: 'numeric', 
        month: 'short', 
        day: 'numeric' 
      });
      
      // Generate both PDF and Excel
      this.generatePDF(updates, today);
      this.generateExcel(updates, today);
      
    } catch (error) {
      console.error('Error generating reports:', error);
      alert('Error generating reports. Please try again.');
    }
  }

  private generatePDF(updates: any[], today: string): void {
    const doc = new jsPDF();
    
    // Add title
    doc.setFontSize(14);
    doc.text('Combined Driver Delivery Updates Report', 14, 15);
    doc.setFontSize(8);
    doc.text(`Date: ${today} | Total Updates: ${updates.length}`, 14, 20);
    
    // Add report generation timestamp
    const reportGeneratedAt = new Date().toLocaleString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: true
    });
    doc.setFontSize(8);
    doc.setFont("helvetica", 'italic');
    doc.text(`Report Generated: ${reportGeneratedAt}`, 14, 25);
    doc.setFont("helvetica", 'normal');
    
    let yPosition = 30;
    
    // Define colors for all tables
    const lightBlue: [number, number, number] = [200, 220, 240];
    const headerBlue: [number, number, number] = [45, 140, 255];
    
    // Prepare data for all sections
    const storesWithDeliveries = updates.filter(update => 
      update.delivery_data && 
      Array.isArray(update.delivery_data) && 
      update.delivery_data.some((delivery: any) => delivery.stores && delivery.stores.length > 0)
    );
    
    const updatesWithLastDeliveryTimes = updates.filter(update => 
      update.last_delivery_times && Object.keys(update.last_delivery_times).length > 0
    );
    
    // Prepare all stores data
    let allStoresData: any[] = [];
    if (storesWithDeliveries.length > 0) {
      storesWithDeliveries.forEach(update => {
        const routeName = update.route_name || 'N/A';
        if (update.delivery_data && Array.isArray(update.delivery_data)) {
          update.delivery_data.forEach((delivery: any) => {
            if (delivery.stores && Array.isArray(delivery.stores)) {
              delivery.stores.forEach((store: any) => {
                allStoresData.push({
                  shop: delivery.shop_name || 'N/A',
                  route: routeName,
                  storeName: store.store_name || 'N/A',
                  storeCode: store.store_code || 'N/A'
                });
              });
            }
          });
        }
      });
    }
    
    // Prepare all delivery times data
    let allDeliveryTimesData: any[] = [];
    if (updatesWithLastDeliveryTimes.length > 0) {
      updatesWithLastDeliveryTimes.forEach(update => {
        const routeName = update.route_name || 'N/A';
        
        if (update.last_delivery_times) {
          Object.entries(update.last_delivery_times).forEach(([shop, time]) => {
            const shopLower = shop.toLowerCase();
            // Only include Circle K and Starbucks
            if (shopLower.includes('circle k') || shopLower.includes('circlek') || shopLower.includes('starbucks')) {
              allDeliveryTimesData.push({
                shop: shop,
                time: time as string,
                route: routeName
              });
            }
          });
        }
      });
    }
    
    // Separate Circle K and Starbucks data
    const circleKStores = allStoresData.filter(store => 
      store.shop.toLowerCase().includes('circle k') || store.shop.toLowerCase().includes('circlek')
    );
    const starbucksStores = allStoresData.filter(store => 
      store.shop.toLowerCase().includes('starbucks')
    );
    
    const circleKDeliveryTimes = allDeliveryTimesData.filter(item => 
      item.shop.toLowerCase().includes('circle k') || item.shop.toLowerCase().includes('circlek')
    );
    const starbucksDeliveryTimes = allDeliveryTimesData.filter(item => 
      item.shop.toLowerCase().includes('starbucks')
    );
    
    // === CIRCLE K SECTION ===
    if (circleKStores.length > 0 || circleKDeliveryTimes.length > 0) {
      // Circle K Outstanding Deliveries
      if (circleKStores.length > 0) {
        doc.setFontSize(9);
        doc.setFont("helvetica", 'bold');
        doc.text('Circle K Deadline 10am : Outstanding Deliveries', 14, yPosition);
        doc.setFont("helvetica", 'normal');
        yPosition += 5;
        
        const circleKTableData = circleKStores.map(store => [
          store.shop,
          store.route,
          store.storeName,
          store.storeCode
        ]);
        
        // Sort by route number
        circleKTableData.sort((a: any[], b: any[]) => {
          const routeA = a[1] as string;
          const routeB = b[1] as string;
          
          const numA = this.extractRouteNumber(routeA);
          const numB = this.extractRouteNumber(routeB);
          
          return numA - numB;
        });
        
        const uniqueCircleKRoutes = Array.from(new Set(circleKTableData.map((row: any[]) => row[1])));
        
        autoTable(doc, {
          startY: yPosition,
          head: [['Shop', 'Route', 'Store Name', 'Store Code']],
          body: circleKTableData as unknown as RowInput[],
          theme: 'grid',
          headStyles: { 
            fillColor: headerBlue,
            fontSize: 8,
            cellPadding: 2
          },
          bodyStyles: {
            fontSize: 7,
            cellPadding: 1
          },
          columnStyles: {
            0: { cellWidth: 25 },
            1: { cellWidth: 25 },
            2: { cellWidth: 'auto' },
            3: { cellWidth: 20 }
          },
          margin: { left: 10, right: 10 },
          didParseCell: function(data: CellHookData) {
            if (data.section === 'body') {
              const rowData = data.row.raw as any[];
              const route = rowData[1];
              
              const routeIndex = uniqueCircleKRoutes.indexOf(route);
              if (routeIndex % 2 === 0) {
                data.cell.styles.fillColor = lightBlue;
              }
            }
          },
          didDrawPage: (data: any) => {
            yPosition = data.cursor?.y ?? yPosition;
          }
        });
        
        yPosition += 10;
      }
      
      // Circle K Last Delivery Times
      if (circleKDeliveryTimes.length > 0) {
        doc.setFontSize(9);
        doc.setFont("helvetica", 'bold');
        doc.text('Circle K Last Delivery Times', 14, yPosition);
        doc.setFont("helvetica", 'normal');
        yPosition += 5;
        
        // Sort by route number, then by shop name
        circleKDeliveryTimes.sort((a, b) => {
          const numA = this.extractRouteNumber(a.route);
          const numB = this.extractRouteNumber(b.route);
          
          if (numA !== numB) {
            return numA - numB;
          }
          
          return a.shop.localeCompare(b.shop);
        });
        
        const circleKDeliveryTableData = circleKDeliveryTimes.map(item => [
          item.shop,
          item.time,
          item.route
        ]);
        
        const uniqueCircleKDeliveryRoutes = Array.from(new Set(circleKDeliveryTableData.map((row: any[]) => row[2])));
        
        autoTable(doc, {
          startY: yPosition,
          head: [['Shop', 'Time', 'Route']],
          body: circleKDeliveryTableData as unknown as RowInput[],
          theme: 'grid',
          headStyles: { 
            fillColor: headerBlue,
            fontSize: 8,
            cellPadding: 2
          },
          bodyStyles: {
            fontSize: 7,
            cellPadding: 1
          },
          columnStyles: {
            0: { cellWidth: 'auto' },
            1: { cellWidth: 25 },
            2: { cellWidth: 25 }
          },
          margin: { left: 10, right: 10 },
          didParseCell: function(data: CellHookData) {
            if (data.section === 'body') {
              const rowData = data.row.raw as any[];
              const route = rowData[2];
              
              const routeIndex = uniqueCircleKDeliveryRoutes.indexOf(route);
              if (routeIndex % 2 === 0) {
                data.cell.styles.fillColor = lightBlue;
              }
            }
          },
          didDrawPage: (data: any) => {
            yPosition = data.cursor?.y ?? yPosition;
          }
        });
        
        yPosition += 15;
      }
    }
    
    // === STARBUCKS SECTION ===
    if (starbucksStores.length > 0 || starbucksDeliveryTimes.length > 0) {
      // Starbucks Outstanding Deliveries
      if (starbucksStores.length > 0) {
        doc.setFontSize(9);
        doc.setFont("helvetica", 'bold');
        doc.text('Starbucks Deadline 9am : Outstanding Deliveries', 14, yPosition);
        doc.setFont("helvetica", 'normal');
        yPosition += 5;
        
        const starbucksTableData = starbucksStores.map(store => [
          store.shop,
          store.route,
          store.storeName,
          store.storeCode
        ]);
        
        // Sort by route number
        starbucksTableData.sort((a: any[], b: any[]) => {
          const routeA = a[1] as string;
          const routeB = b[1] as string;
          
          const numA = this.extractRouteNumber(routeA);
          const numB = this.extractRouteNumber(routeB);
          
          return numA - numB;
        });
        
        const uniqueStarbucksRoutes = Array.from(new Set(starbucksTableData.map((row: any[]) => row[1])));
        
        autoTable(doc, {
          startY: yPosition,
          head: [['Shop', 'Route', 'Store Name', 'Store Code']],
          body: starbucksTableData as unknown as RowInput[],
          theme: 'grid',
          headStyles: { 
            fillColor: headerBlue,
            fontSize: 8,
            cellPadding: 2
          },
          bodyStyles: {
            fontSize: 7,
            cellPadding: 1
          },
          columnStyles: {
            0: { cellWidth: 25 },
            1: { cellWidth: 25 },
            2: { cellWidth: 'auto' },
            3: { cellWidth: 20 }
          },
          margin: { left: 10, right: 10 },
          didParseCell: function(data: CellHookData) {
            if (data.section === 'body') {
              const rowData = data.row.raw as any[];
              const route = rowData[1];
              
              const routeIndex = uniqueStarbucksRoutes.indexOf(route);
              if (routeIndex % 2 === 0) {
                data.cell.styles.fillColor = lightBlue;
              }
            }
          },
          didDrawPage: (data: any) => {
            yPosition = data.cursor?.y ?? yPosition;
          }
        });
        
        yPosition += 10;
      }
      
      // Starbucks Last Delivery Times
      if (starbucksDeliveryTimes.length > 0) {
        doc.setFontSize(9);
        doc.setFont("helvetica", 'bold');
        doc.text('Starbucks Last Delivery Times', 14, yPosition);
        doc.setFont("helvetica", 'normal');
        yPosition += 5;
        
        // Sort by route number, then by shop name
        starbucksDeliveryTimes.sort((a, b) => {
          const numA = this.extractRouteNumber(a.route);
          const numB = this.extractRouteNumber(b.route);
          
          if (numA !== numB) {
            return numA - numB;
          }
          
          return a.shop.localeCompare(b.shop);
        });
        
        const starbucksDeliveryTableData = starbucksDeliveryTimes.map(item => [
          item.shop,
          item.time,
          item.route
        ]);
        
        const uniqueStarbucksDeliveryRoutes = Array.from(new Set(starbucksDeliveryTableData.map((row: any[]) => row[2])));
        
        autoTable(doc, {
          startY: yPosition,
          head: [['Shop', 'Time', 'Route']],
          body: starbucksDeliveryTableData as unknown as RowInput[],
          theme: 'grid',
          headStyles: { 
            fillColor: headerBlue,
            fontSize: 8,
            cellPadding: 2
          },
          bodyStyles: {
            fontSize: 7,
            cellPadding: 1
          },
          columnStyles: {
            0: { cellWidth: 'auto' },
            1: { cellWidth: 25 },
            2: { cellWidth: 25 }
          },
          margin: { left: 10, right: 10 },
          didParseCell: function(data: CellHookData) {
            if (data.section === 'body') {
              const rowData = data.row.raw as any[];
              const route = rowData[2];
              
              const routeIndex = uniqueStarbucksDeliveryRoutes.indexOf(route);
              if (routeIndex % 2 === 0) {
                data.cell.styles.fillColor = lightBlue;
              }
            }
          },
          didDrawPage: (data: any) => {
            yPosition = data.cursor?.y ?? yPosition;
          }
        });
        
        yPosition += 15;
      }
    }
    
    // === ADVANCED NOTIFICATIONS SECTION ===
    const updatesWithComments = updates.filter(update => 
      update.comments && update.comments.trim().length > 0
    );
    
    if (updatesWithComments.length > 0) {
      doc.setFontSize(9);
      doc.setFont("helvetica", 'bold');
      doc.text('Advanced Notifications', 14, yPosition);
      doc.setFont("helvetica", 'normal');
      yPosition += 5;
      
      const commentsData: any[] = [];
      
      updatesWithComments.forEach(update => {
        const routeName = update.route_name || 'N/A';
        const updateTime = this.formatDate(update.created_at);
        
        commentsData.push([
          routeName,
          updateTime,
          update.comments.trim()
        ]);
      });
      
      if (commentsData.length > 0) {
        // Sort by route number
        commentsData.sort((a: any[], b: any[]) => {
          const routeA = a[0] as string;
          const routeB = b[0] as string;
          
          const numA = this.extractRouteNumber(routeA);
          const numB = this.extractRouteNumber(routeB);
          
          return numA - numB;
        });
        
        const uniqueRoutesComments = Array.from(new Set(commentsData.map((row: any[]) => row[0])));
        
        autoTable(doc, {
          startY: yPosition,
          head: [['Route', 'Time', 'Comment']],
          body: commentsData as unknown as RowInput[],
          theme: 'grid',
          headStyles: { 
            fillColor: headerBlue,
            fontSize: 8,
            cellPadding: 2
          },
          bodyStyles: {
            fontSize: 7,
            cellPadding: 1
          },
          columnStyles: {
            0: { cellWidth: 20 },
            1: { cellWidth: 30 },
            2: { cellWidth: 'auto' }
          },
          margin: { left: 10, right: 10 },
          didParseCell: function(data: CellHookData) {
            if (data.section === 'body') {
              const rowData = data.row.raw as any[];
              const route = rowData[0];
              
              const routeIndex = uniqueRoutesComments.indexOf(route);
              if (routeIndex % 2 === 0) {
                data.cell.styles.fillColor = lightBlue;
              }
            }
          },
          didDrawPage: (data: any) => {
            yPosition = data.cursor?.y ?? yPosition;
          }
        });
      }
    }
    
    // Save the PDF
    const fileName = `driver-updates-${today.replace(/\s/g, '-')}.pdf`;
    doc.save(fileName);
  }

  private generateExcel(updates: any[], today: string): void {
    // Create a new workbook
    const workbook = XLSX.utils.book_new();
    
    // Create the main worksheet data array
    const worksheetData: any[][] = [];
    
    // Add title and header information
    worksheetData.push(['Combined Driver Delivery Updates Report']);
    worksheetData.push([`Date: ${today} | Total Updates: ${updates.length}`]);
    
    // Add report generation timestamp
    const reportGeneratedAt = new Date().toLocaleString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: true
    });
    worksheetData.push([`Report Generated: ${reportGeneratedAt}`]);
    worksheetData.push(['']); // Empty row
    
    // Prepare data for all sections
    const storesWithDeliveries = updates.filter(update => 
      update.delivery_data && 
      Array.isArray(update.delivery_data) && 
      update.delivery_data.some((delivery: any) => delivery.stores && delivery.stores.length > 0)
    );
    
    const updatesWithLastDeliveryTimes = updates.filter(update => 
      update.last_delivery_times && Object.keys(update.last_delivery_times).length > 0
    );
    
    // Prepare all stores data
    let allStoresData: any[] = [];
    if (storesWithDeliveries.length > 0) {
      storesWithDeliveries.forEach(update => {
        const routeName = update.route_name || 'N/A';
        if (update.delivery_data && Array.isArray(update.delivery_data)) {
          update.delivery_data.forEach((delivery: any) => {
            if (delivery.stores && Array.isArray(delivery.stores)) {
              delivery.stores.forEach((store: any) => {
                allStoresData.push({
                  shop: delivery.shop_name || 'N/A',
                  route: routeName,
                  storeName: store.store_name || 'N/A',
                  storeCode: store.store_code || 'N/A'
                });
              });
            }
          });
        }
      });
    }
    
    // Prepare all delivery times data
    let allDeliveryTimesData: any[] = [];
    if (updatesWithLastDeliveryTimes.length > 0) {
      updatesWithLastDeliveryTimes.forEach(update => {
        const routeName = update.route_name || 'N/A';
        
        if (update.last_delivery_times) {
          Object.entries(update.last_delivery_times).forEach(([shop, time]) => {
            const shopLower = shop.toLowerCase();
            // Only include Circle K and Starbucks
            if (shopLower.includes('circle k') || shopLower.includes('circlek') || shopLower.includes('starbucks')) {
              allDeliveryTimesData.push({
                shop: shop,
                time: time as string,
                route: routeName
              });
            }
          });
        }
      });
    }
    
    // Separate Circle K and Starbucks data
    const circleKStores = allStoresData.filter(store => 
      store.shop.toLowerCase().includes('circle k') || store.shop.toLowerCase().includes('circlek')
    );
    const starbucksStores = allStoresData.filter(store => 
      store.shop.toLowerCase().includes('starbucks')
    );
    
    const circleKDeliveryTimes = allDeliveryTimesData.filter(item => 
      item.shop.toLowerCase().includes('circle k') || item.shop.toLowerCase().includes('circlek')
    );
    const starbucksDeliveryTimes = allDeliveryTimesData.filter(item => 
      item.shop.toLowerCase().includes('starbucks')
    );
    
    // === CIRCLE K SECTION ===
    if (circleKStores.length > 0 || circleKDeliveryTimes.length > 0) {
      // Circle K Outstanding Deliveries
      if (circleKStores.length > 0) {
        worksheetData.push(['Circle K Deadline 10am : Outstanding Deliveries']);
        worksheetData.push(['Shop', 'Route', 'Store Name', 'Store Code']);
        
        const circleKTableData = circleKStores
          .sort((a, b) => this.extractRouteNumber(a.route) - this.extractRouteNumber(b.route))
          .map(store => [
            store.shop,
            store.route,
            store.storeName,
            store.storeCode
          ]);
        
        worksheetData.push(...circleKTableData);
        worksheetData.push(['']); // Empty row after section
      }
      
      // Circle K Last Delivery Times
      if (circleKDeliveryTimes.length > 0) {
        worksheetData.push(['Circle K Last Delivery Times']);
        worksheetData.push(['Shop', 'Time', 'Route']);
        
        // Sort by route number, then by shop name
        circleKDeliveryTimes.sort((a, b) => {
          const numA = this.extractRouteNumber(a.route);
          const numB = this.extractRouteNumber(b.route);
          
          if (numA !== numB) {
            return numA - numB;
          }
          
          return a.shop.localeCompare(b.shop);
        });
        
        const circleKDeliveryTableData = circleKDeliveryTimes.map(item => [
          item.shop,
          item.time,
          item.route
        ]);
        
        worksheetData.push(...circleKDeliveryTableData);
        worksheetData.push(['']); // Empty row after section
      }
    }
    
    // === STARBUCKS SECTION ===
    if (starbucksStores.length > 0 || starbucksDeliveryTimes.length > 0) {
      // Starbucks Outstanding Deliveries
      if (starbucksStores.length > 0) {
        worksheetData.push(['Starbucks Deadline 9am : Outstanding Deliveries']);
        worksheetData.push(['Shop', 'Route', 'Store Name', 'Store Code']);
        
        const starbucksTableData = starbucksStores
          .sort((a, b) => this.extractRouteNumber(a.route) - this.extractRouteNumber(b.route))
          .map(store => [
            store.shop,
            store.route,
            store.storeName,
            store.storeCode
          ]);
        
        worksheetData.push(...starbucksTableData);
        worksheetData.push(['']); // Empty row after section
      }
      
      // Starbucks Last Delivery Times
      if (starbucksDeliveryTimes.length > 0) {
        worksheetData.push(['Starbucks Last Delivery Times']);
        worksheetData.push(['Shop', 'Time', 'Route']);
        
        // Sort by route number, then by shop name
        starbucksDeliveryTimes.sort((a, b) => {
          const numA = this.extractRouteNumber(a.route);
          const numB = this.extractRouteNumber(b.route);
          
          if (numA !== numB) {
            return numA - numB;
          }
          
          return a.shop.localeCompare(b.shop);
        });
        
        const starbucksDeliveryTableData = starbucksDeliveryTimes.map(item => [
          item.shop,
          item.time,
          item.route
        ]);
        
        worksheetData.push(...starbucksDeliveryTableData);
        worksheetData.push(['']); // Empty row after section
      }
    }
    
    // === ADVANCED NOTIFICATIONS SECTION ===
    const updatesWithComments = updates.filter(update => 
      update.comments && update.comments.trim().length > 0
    );
    
    if (updatesWithComments.length > 0) {
      worksheetData.push(['Advanced Notifications']);
      worksheetData.push(['Route', 'Time', 'Comment']);
      
      const commentsData = updatesWithComments
        .sort((a, b) => this.extractRouteNumber(a.route_name || '') - this.extractRouteNumber(b.route_name || ''))
        .map(update => [
          update.route_name || 'N/A',
          this.formatDate(update.created_at),
          update.comments.trim()
        ]);
      
      worksheetData.push(...commentsData);
    }
    
    // Create the worksheet from the data array
    const worksheet = XLSX.utils.aoa_to_sheet(worksheetData);
    
    // Set column widths
    worksheet['!cols'] = [
      { width: 30 }, // Column A - Shop/Section headers
      { width: 15 }, // Column B - Route/Time
      { width: 50 }, // Column C - Store Name/Comment
      { width: 15 }  // Column D - Store Code
    ];
    
    // Apply styling to specific cells
    const range = XLSX.utils.decode_range(worksheet['!ref'] || 'A1');
    
    // Style all cells first with basic formatting
    for (let row = 0; row <= range.e.r; row++) {
      for (let col = 0; col <= range.e.c; col++) {
        const cellAddress = XLSX.utils.encode_cell({ r: row, c: col });
        if (!worksheet[cellAddress]) continue;
        
        const cellValue = worksheet[cellAddress].v?.toString() || '';
        
        // Main title styling
        if (cellValue === 'Combined Driver Delivery Updates Report') {
          worksheet[cellAddress].s = {
            font: { bold: true, sz: 16, color: { rgb: "FFFFFF" } },
            fill: { fgColor: { rgb: "1F4E79" } },
            alignment: { horizontal: 'center', vertical: 'center' },
            border: {
              top: { style: 'thick', color: { rgb: "000000" } },
              bottom: { style: 'thick', color: { rgb: "000000" } },
              left: { style: 'thick', color: { rgb: "000000" } },
              right: { style: 'thick', color: { rgb: "000000" } }
            }
          };
        }
        
        // Date line styling
        else if (cellValue.includes('Date:') && cellValue.includes('Total Updates:')) {
          worksheet[cellAddress].s = {
            font: { bold: true, sz: 11, color: { rgb: "333333" } },
            fill: { fgColor: { rgb: "F2F2F2" } },
            alignment: { horizontal: 'center', vertical: 'center' }
          };
        }
        
        // Report generated timestamp styling
        else if (cellValue.includes('Report Generated:')) {
          worksheet[cellAddress].s = {
            font: { italic: true, sz: 10, color: { rgb: "666666" } },
            fill: { fgColor: { rgb: "F8F9FA" } },
            alignment: { horizontal: 'center', vertical: 'center' }
          };
        }
        
        // Section headers styling (Circle K and Starbucks sections)
        else if (cellValue.includes('Circle K Deadline') || 
                 cellValue.includes('Starbucks Deadline') ||
                 cellValue.includes('Circle K Last Delivery Times') ||
                 cellValue.includes('Starbucks Last Delivery Times') ||
                 cellValue === 'Advanced Notifications') {
          worksheet[cellAddress].s = {
            font: { bold: true, sz: 12, color: { rgb: "FFFFFF" } },
            fill: { fgColor: { rgb: "2D8CFF" } },
            alignment: { horizontal: 'left', vertical: 'center' },
            border: {
              top: { style: 'medium', color: { rgb: "000000" } },
              bottom: { style: 'medium', color: { rgb: "000000" } },
              left: { style: 'medium', color: { rgb: "000000" } },
              right: { style: 'medium', color: { rgb: "000000" } }
            }
          };
        }
        
        // Table headers styling (Shop, Route, Time, etc.)
        else if (cellValue === 'Shop' || cellValue === 'Route' || 
                 cellValue === 'Time' || cellValue === 'Store Name' || 
                 cellValue === 'Store Code' || cellValue === 'Comment') {
          worksheet[cellAddress].s = {
            font: { bold: true, sz: 10, color: { rgb: "FFFFFF" } },
            fill: { fgColor: { rgb: "4472C4" } },
            alignment: { horizontal: 'center', vertical: 'center' },
            border: {
              top: { style: 'thin', color: { rgb: "000000" } },
              bottom: { style: 'thin', color: { rgb: "000000" } },
              left: { style: 'thin', color: { rgb: "000000" } },
              right: { style: 'thin', color: { rgb: "000000" } }
            }
          };
        }
        
        // Data rows styling
        else if (cellValue.trim() !== '' && 
                 !cellValue.includes('Circle K') && 
                 !cellValue.includes('Starbucks') &&
                 cellValue !== 'Advanced Notifications' &&
                 cellValue !== 'Combined Driver Delivery Updates Report' &&
                 !cellValue.includes('Date:')) {
          
          // Determine if this is an even or odd data row
          let dataRowIndex = 0;
          for (let r = 0; r < row; r++) {
            const checkCell = worksheet[XLSX.utils.encode_cell({ r: r, c: 0 })];
            if (checkCell && checkCell.v) {
              const checkValue = checkCell.v.toString();
              if (checkValue.trim() !== '' && 
                  !checkValue.includes('Circle K') && 
                  !checkValue.includes('Starbucks') &&
                  checkValue !== 'Advanced Notifications' &&
                  checkValue !== 'Combined Driver Delivery Updates Report' &&
                  !checkValue.includes('Date:') &&
                  checkValue !== 'Shop' && checkValue !== 'Route' && 
                  checkValue !== 'Time' && checkValue !== 'Store Name' && 
                  checkValue !== 'Store Code' && checkValue !== 'Comment') {
                dataRowIndex++;
              }
            }
          }
          
          const isEvenRow = dataRowIndex % 2 === 0;
          
          worksheet[cellAddress].s = {
            font: { sz: 9, color: { rgb: "000000" }, bold: col === 0 },
            fill: { fgColor: { rgb: isEvenRow ? "F8F9FA" : "FFFFFF" } },
            alignment: { horizontal: 'left', vertical: 'center' },
            border: {
              top: { style: 'thin', color: { rgb: "D1D5DB" } },
              bottom: { style: 'thin', color: { rgb: "D1D5DB" } },
              left: { style: 'thin', color: { rgb: "D1D5DB" } },
              right: { style: 'thin', color: { rgb: "D1D5DB" } }
            }
          };
          
          // Special handling for comment column (wrap text)
          if (col === 2 && cellValue.length > 50) {
            worksheet[cellAddress].s.alignment.wrapText = true;
          }
        }
      }
    }
    
    // Set up merges for headers
    if (!worksheet['!merges']) worksheet['!merges'] = [];
    
    // Find and merge title and section headers
    for (let row = 0; row <= range.e.r; row++) {
      const cellA = worksheet[XLSX.utils.encode_cell({ r: row, c: 0 })];
      if (cellA && cellA.v) {
        const cellValue = cellA.v.toString();
        
        if (cellValue === 'Combined Driver Delivery Updates Report' ||
            cellValue.includes('Date:') ||
            cellValue.includes('Report Generated:') ||
            cellValue.includes('Circle K Deadline') ||
            cellValue.includes('Starbucks Deadline') ||
            cellValue.includes('Circle K Last Delivery Times') ||
            cellValue.includes('Starbucks Last Delivery Times') ||
            cellValue === 'Advanced Notifications') {
          worksheet['!merges'].push({ s: { r: row, c: 0 }, e: { r: row, c: 3 } });
        }
      }
    }
    
    // Set row heights
    worksheet['!rows'] = [];
    for (let row = 0; row <= range.e.r; row++) {
      const cellA = worksheet[XLSX.utils.encode_cell({ r: row, c: 0 })];
      if (cellA && cellA.v) {
        const cellValue = cellA.v.toString();
        
        if (cellValue === 'Combined Driver Delivery Updates Report') {
          worksheet['!rows'][row] = { hpt: 25 };
        } else if (cellValue.includes('Circle K') || 
                   cellValue.includes('Starbucks') ||
                   cellValue === 'Advanced Notifications') {
          worksheet['!rows'][row] = { hpt: 20 };
        } else if (cellValue === 'Shop' || cellValue === 'Route' || cellValue === 'Time') {
          worksheet['!rows'][row] = { hpt: 18 };
        } else if (cellValue.includes('Date:')) {
          worksheet['!rows'][row] = { hpt: 16 };
        } else if (cellValue.includes('Report Generated:')) {
          worksheet['!rows'][row] = { hpt: 14 };
        } else {
          worksheet['!rows'][row] = { hpt: 15 };
        }
      }
    }
    
    // Add the worksheet to the workbook
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Driver Updates Report');
    
    // Save the Excel file
    const fileName = `driver-updates-${today.replace(/\s/g, '-')}.xlsx`;
    XLSX.writeFile(workbook, fileName);
  }

  // Keep the original methods for backward compatibility
  async loadTodaysUpdates(): Promise<void> {
    this.loading = true;
    try {
      const { data, error } = await this.supabaseService.getSupabase()
        .from('driver_delivery_updates')
        .select('*, drivers(name, custom_id)')
        .gte('created_at', this.startOfToday)
        .lt('created_at', this.endOfToday)
        .order('created_at', { ascending: false })
        .range(this.page * this.pageSize, (this.page + 1) * this.pageSize - 1);

      if (error) throw error;

      const count = await this.getTotalCount();
      this.totalCount = count;
      this.driverUpdates = data || [];
      console.log('Loaded driver updates:', this.driverUpdates);
    } catch (error) {
      console.error('Error loading today\'s driver updates:', error);
      this.driverUpdates = [];
    } finally {
      this.loading = false;
    }
  }

  async getTotalCount(): Promise<number> {
    try {
      const { count, error } = await this.supabaseService.getSupabase()
        .from('driver_delivery_updates')
        .select('id', { count: 'exact', head: true })
        .gte('created_at', this.startOfToday)
        .lt('created_at', this.endOfToday);

      if (error) throw error;
      return count || 0;
    } catch (error) {
      console.error('Error getting count:', error);
      return 0;
    }
  }

  formatDate(dateString: string): string {
    if (!dateString) return 'N/A';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  viewUpdateDetails(update: any): void {
    this.selectedUpdate = update;
    this.viewMode = 'detail';
    this.selectedStores = []; // Reset selected stores when viewing a new update
  }

  backToList(): void {
    this.viewMode = 'list';
    this.selectedUpdate = null;
    this.selectedStores = [];
  }

  nextPage(): void {
    if ((this.page + 1) * this.pageSize < this.totalCount) {
      this.page++;
      this.loadTodaysUpdates();
    }
  }

  prevPage(): void {
    if (this.page > 0) {
      this.page--;
      this.loadTodaysUpdates();
    }
  }

  getDeliveryCount(update: any): number {
    if (!update.delivery_data || !Array.isArray(update.delivery_data)) {
      return 0;
    }
    return update.delivery_data.length;
  }

  getStoreCount(update: any): number {
    if (!update.delivery_data || !Array.isArray(update.delivery_data)) {
      return 0;
    }
    
    let storeCount = 0;
    for (const delivery of update.delivery_data) {
      if (delivery.stores && Array.isArray(delivery.stores)) {
        storeCount += delivery.stores.length;
      }
    }
    return storeCount;
  }

  // New methods for store selection and PDF export
  getAllStoresFromDeliveries(): any[] {
    if (!this.selectedUpdate?.delivery_data) return [];
    
    let allStores: any[] = [];
    this.selectedUpdate.delivery_data.forEach((delivery: any, deliveryIndex: number) => {
      if (delivery.stores && Array.isArray(delivery.stores)) {
        delivery.stores.forEach((store: any, storeIndex: number) => {
          allStores.push({
            deliveryIndex,
            storeIndex,
            storeData: {
              ...store,
              shop_name: delivery.shop_name,
              delivery_time: delivery.delivery_time
            }
          });
        });
      }
    });
    
    return allStores;
  }

  toggleStoreSelection(deliveryIndex: number, storeIndex: number): void {
    const storeKey = `${deliveryIndex}-${storeIndex}`;
    const existingIndex = this.selectedStores.findIndex(
      s => s.deliveryIndex === deliveryIndex && s.storeIndex === storeIndex
    );
    
    if (existingIndex > -1) {
      // Remove if already selected
      this.selectedStores.splice(existingIndex, 1);
    } else {
      // Add to selection with full store data for PDF generation
      const delivery = this.selectedUpdate.delivery_data[deliveryIndex];
      const store = delivery.stores[storeIndex];
      
      this.selectedStores.push({
        deliveryIndex,
        storeIndex,
        storeData: {
          ...store,
          shop_name: delivery.shop_name,
          delivery_time: delivery.delivery_time
        }
      });
    }
  }

  isStoreSelected(deliveryIndex: number, storeIndex: number): boolean {
    return this.selectedStores.some(
      s => s.deliveryIndex === deliveryIndex && s.storeIndex === storeIndex
    );
  }

  hasSelectedStores(): boolean {
    return this.selectedStores.length > 0;
  }

  selectAllStores(): void {
    this.selectedStores = this.getAllStoresFromDeliveries();
  }

  deselectAllStores(): void {
    this.selectedStores = [];
  }

  exportSelectedStores(): void {
    if (!this.hasSelectedStores()) return;
    
    try {
      const doc = new jsPDF();
      const driverName = this.selectedUpdate.drivers?.name || 'Unknown Driver';
      const routeName = this.selectedUpdate.route_name || 'No Route';
      const reportDate = this.formatDate(this.selectedUpdate.created_at);
      
      // Add title and metadata
      doc.setFontSize(18);
      doc.text('Driver Delivery Update Report', 14, 22);
      
      doc.setFontSize(12);
      doc.text(`Driver: ${driverName}`, 14, 32);
      doc.text(`Route: ${routeName}`, 14, 38);
      doc.text(`Date: ${reportDate}`, 14, 44);
      
      // Add comments if available
      if (this.selectedUpdate.comments) {
        doc.setFontSize(14);
        doc.text('Driver Comments:', 14, 55);
        doc.setFontSize(10);
        
        const splitComments = doc.splitTextToSize(this.selectedUpdate.comments, 180);
        doc.text(splitComments, 14, 62);
      }
      
      // Prepare table data
      const tableData: any[] = this.selectedStores.map(selected => {
        const { storeData } = selected;
        return [
          storeData.shop_name || 'N/A',
          storeData.delivery_time || 'N/A',
          storeData.store_name || 'N/A',
          storeData.store_code || 'N/A'
        ];
      });
      
      // Sort by delivery time
      tableData.sort((a: any[], b: any[]) => {
        const timeA = a[1] as string;
        const timeB = b[1] as string;
        
        return timeA.localeCompare(timeB);
      });
      
      // Set Y position based on whether we have comments
      const tableY = this.selectedUpdate.comments ? 75 : 55;
      
      // Add the table
      let finalY = tableY;
      doc.setFontSize(14);
      doc.text('Delivery Update - Outstanding Deliveries', 14, tableY - 10);
      
      // Create a variable for colors
      const lightBlue: [number, number, number] = [200, 220, 240]; // Light blue color for alternating rows
      const headerBlue: [number, number, number] = [45, 140, 255]; // Blue color for headers
      
      autoTable(doc, {
        startY: tableY,
        head: [['Shop', 'Delivery Time', 'Store Name', 'Store Code']],
        body: tableData as any[],
        theme: 'grid',
        headStyles: { fillColor: headerBlue },
        didParseCell: function(data: any) {
          // Color rows based on route
          if (data.section === 'body') {
            const rowData = data.row.raw as any[];
            const route = rowData[1]; // Route/time is in second column
            
            // Check if this is an even-indexed route
            const routeNumber = extractRouteNumberForStyle(route);
            if (routeNumber % 2 === 0) {
              data.cell.styles.fillColor = lightBlue;
            }
          }
        },
        didDrawPage: function(data: any) {
          finalY = data.cursor?.y ?? finalY;
        }
      });
      
      // Add last delivery times if available
      if (this.selectedUpdate.last_delivery_times) {
        // Get position after last table
        const lastDeliveryY = finalY + 15;
        
        doc.setFontSize(14);
        doc.text('Last Delivery Times:', 14, lastDeliveryY);
        
        // Create a variable for colors
        const lightBlue: [number, number, number] = [200, 220, 240]; // Light blue color for alternating rows
        const headerBlue: [number, number, number] = [45, 140, 255]; // Blue color for headers
        
        const lastDeliveryEntries = Object.entries(this.selectedUpdate.last_delivery_times);
        
        if (lastDeliveryEntries.length > 0) {
          // Sort by shop name
          lastDeliveryEntries.sort((a: any[], b: any[]) => {
            const shopA = a[0] as string;
            const shopB = b[0] as string;
            
            return shopA.localeCompare(shopB);
          });
          
          autoTable(doc, {
            startY: lastDeliveryY + 7,
            head: [['Shop', 'Time']],
            body: lastDeliveryEntries as unknown as RowInput[],
            theme: 'grid',
            headStyles: { fillColor: headerBlue },
            didParseCell: function(data: CellHookData) {
              // Color rows based on shop (which is equivalent to route in this context)
              if (data.section === 'body') {
                const rowData = data.row.raw as any[];
                const shop = rowData[0]; // Shop is first column
                
                // Use a consistent method for determining color
                const shopIndex = lastDeliveryEntries.findIndex(
                  (s: any[]) => s[0] === shop
                );
                
                if (shopIndex % 2 === 0) {
                  data.cell.styles.fillColor = lightBlue;
                }
              }
            }
          });
        }
      }
      
      // Save the PDF
      const todayDate = new Date().toLocaleDateString('en-US', { 
        year: 'numeric', 
        month: 'short', 
        day: 'numeric' 
      });
      const fileName = `Delivery Update (${todayDate}).pdf`;
      doc.save(fileName);
    } catch (error) {
      console.error('Error generating PDF:', error);
      alert('Error generating PDF. Please try again.');
    }
  }

  exportFullUpdate(update: any): void {
    try {
      const doc = new jsPDF();
      const driverName = update.drivers?.name || 'Unknown Driver';
      const routeName = update.route_name || 'No Route';
      const reportDate = this.formatDate(update.created_at);
      
      // Add title and metadata
      doc.setFontSize(18);
      doc.text('Driver Delivery Update Report', 14, 22);
      
      doc.setFontSize(12);
      doc.text(`Driver: ${driverName}`, 14, 32);
      doc.text(`Route: ${routeName}`, 14, 38);
      doc.text(`Date: ${reportDate}`, 14, 44);
      
      // Add comments if available
      let yPosition = 55;
      if (update.comments) {
        doc.setFontSize(14);
        doc.text('Driver Comments:', 14, yPosition);
        doc.setFontSize(10);
        
        const splitComments = doc.splitTextToSize(update.comments, 180);
        doc.text(splitComments, 14, yPosition + 7);
        yPosition += 15 + (splitComments.length * 5);
      }
      
      // Prepare complete data for all stores
      if (update.delivery_data && Array.isArray(update.delivery_data)) {
        const allStoresData: any[] = [];
        update.delivery_data.forEach((delivery: any) => {
          if (delivery.stores && Array.isArray(delivery.stores)) {
            delivery.stores.forEach((store: any) => {
              allStoresData.push([
                delivery.shop_name || 'N/A',
                delivery.delivery_time || 'N/A',
                store.store_name || 'N/A',
                store.store_code || 'N/A'
              ]);
            });
          }
        });
        
        if (allStoresData.length > 0) {
          // Sort by route number
          allStoresData.sort((a: any[], b: any[]) => {
            const routeA = a[1] as string;
            const routeB = b[1] as string;
            
            const numA = this.extractRouteNumber(routeA);
            const numB = this.extractRouteNumber(routeB);
            
            return numA - numB;
          });
          
          // Add the table with all stores
          let storesTableFinalY = yPosition;
          doc.setFontSize(14);
          doc.text('Delivery Update - Outstanding Deliveries', 14, yPosition);
          yPosition += 7;
          
          // Define colors
          const lightBlue: [number, number, number] = [200, 220, 240];
          const headerBlue: [number, number, number] = [45, 140, 255];
          
          autoTable(doc, {
            startY: yPosition,
            head: [['Shop', 'Delivery Time', 'Store Name', 'Store Code']],
            body: allStoresData as unknown as RowInput[],
            theme: 'grid',
            headStyles: { fillColor: headerBlue },
            didParseCell: function(data: CellHookData) {
              // Color rows based on route
              if (data.section === 'body') {
                const rowData = data.row.raw as any[];
                const route = rowData[1]; // Delivery time column
                
                // Get route number and color even routes
                const routeNumber = extractRouteNumberForStyle(route);
                if (routeNumber % 2 === 0) {
                  data.cell.styles.fillColor = lightBlue;
                }
              }
            },
            didDrawPage: function(data: any) {
              storesTableFinalY = data.cursor?.y ?? storesTableFinalY;
            }
          });
          
          // Get position after table
          yPosition = storesTableFinalY + 15;
        }
      }
      
      // Add last delivery times if available
      if (update.last_delivery_times) {
        doc.setFontSize(14);
        doc.text('Last Delivery Times:', 14, yPosition);
        
        // Define colors for this section
        const lightBlue: [number, number, number] = [200, 220, 240];
        const headerBlue: [number, number, number] = [45, 140, 255];
        
        const lastDeliveryEntries = Object.entries(update.last_delivery_times);
        
        if (lastDeliveryEntries.length > 0) {
          // Sort by route (shop name)
          lastDeliveryEntries.sort((a: any[], b: any[]) => {
            const shopA = a[0] as string;
            const shopB = b[0] as string;
            
            const numA = this.extractRouteNumber(shopA);
            const numB = this.extractRouteNumber(shopB);
            
            return numA - numB;
          });
          
          autoTable(doc, {
            startY: yPosition + 7,
            head: [['Shop', 'Time']],
            body: lastDeliveryEntries as unknown as RowInput[],
            theme: 'grid',
            headStyles: { fillColor: headerBlue },
            didParseCell: function(data: CellHookData) {
              // Color rows based on shop (which is equivalent to route in this context)
              if (data.section === 'body') {
                const rowData = data.row.raw as any[];
                const shop = rowData[0]; // Shop is first column
                
                // Use a consistent method for determining color
                const shopIndex = lastDeliveryEntries.findIndex(
                  (s: any[]) => s[0] === shop
                );
                
                if (shopIndex % 2 === 0) {
                  data.cell.styles.fillColor = lightBlue;
                }
              }
            }
          });
        }
      }
      
      // Save the PDF
      const todayDate = new Date().toLocaleDateString('en-US', { 
        year: 'numeric', 
        month: 'short', 
        day: 'numeric' 
      });
      const fileName = `Delivery Update (${todayDate}).pdf`;
      doc.save(fileName);
    } catch (error) {
      console.error('Error generating PDF:', error);
      alert('Error generating PDF. Please try again.');
    }
  }

  // Methods for handling multiple selection
  toggleUpdateSelection(updateId: number): void {
    if (this.selectedUpdates.has(updateId)) {
      this.selectedUpdates.delete(updateId);
    } else {
      this.selectedUpdates.add(updateId);
    }
  }

  isUpdateSelected(updateId: number): boolean {
    return this.selectedUpdates.has(updateId);
  }

  selectAllUpdates(): void {
    this.driverUpdates.forEach(update => {
      if (update.id) {
        this.selectedUpdates.add(update.id);
      }
    });
  }

  deselectAllUpdates(): void {
    this.selectedUpdates.clear();
  }

  hasSelectedUpdates(): boolean {
    return this.selectedUpdates.size > 0;
  }

  // Method to export multiple updates in a highly condensed format
  async exportSelectedUpdates(): Promise<void> {
    if (!this.hasSelectedUpdates()) return;
    
    try {
      // Collect all selected updates
      const selectedUpdateIds = Array.from(this.selectedUpdates);
      const updates = this.driverUpdates.filter(update => selectedUpdateIds.includes(update.id));
      
      if (updates.length === 0) {
        alert('No updates selected for export.');
        return;
      }
      
      this.exportMultipleUpdates(updates);
    } catch (error) {
      console.error('Error exporting selected updates:', error);
      alert('Error exporting updates. Please try again.');
    }
  }

  // Helper function for extracting route number for styling purposes
  private extractRouteNumber(routeName: string): number {
    if (!routeName) return Infinity; // Handle undefined/empty route names
    
    // Match numbers in the route name
    const match = routeName.match(/\d+/);
    if (match) {
      return parseInt(match[0], 10);
    }
    return Infinity; // If no number found, put at the end
  }

  getOutstandingDeliveriesForDay(dayGroup: DayGroup): number {
    let totalOutstanding = 0;
    dayGroup.updates.forEach(update => {
      if (update.delivery_data && Array.isArray(update.delivery_data)) {
        update.delivery_data.forEach((delivery: any) => {
          if (delivery.stores && delivery.stores.length > 0) {
            totalOutstanding += delivery.stores.length;
          }
        });
      }
    });
    return totalOutstanding;
  }

  getAdvancedNotificationsForDay(dayGroup: DayGroup): number {
    return dayGroup.updates.filter(update => update.comments && update.comments.trim().length > 0).length;
  }
}

// Helper function for extracting route number for styling purposes
function extractRouteNumberForStyle(routeName: string): number {
  if (!routeName) return 0;
  
  // Match numbers in the route name
  const match = routeName.match(/\d+/);
  if (match) {
    return parseInt(match[0], 10);
  }
  return 0;
} 