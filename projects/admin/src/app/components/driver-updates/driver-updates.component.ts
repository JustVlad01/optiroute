import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { SupabaseService } from '../../services/supabase.service';
import { FormsModule } from '@angular/forms';
import jsPDF from 'jspdf';
import autoTable, { RowInput, CellHookData } from 'jspdf-autotable';
import { Chart, ChartConfiguration, ChartType, registerables } from 'chart.js';

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
          deliveryTimes: [],
          dailyStats: {}, // Track daily statistics for weekly averaging
          circleKDeliveries: 0,
          starbucksDeliveries: 0,
          circleKTimes: [],
          starbucksTimes: []
        };
      }

      // Initialize daily stats for this route and date if not exists
      if (!routeData[route].dailyStats[updateDate]) {
        routeData[route].dailyStats[updateDate] = {
          totalDeliveries: 0,
          outstandingDeliveries: 0
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
          routeData[route].deliveryTimes.push(timeStr);
          
          // Check if it's Circle K or Starbucks
          const shopLower = shop.toLowerCase();
          if (shopLower.includes('circle k') || shopLower.includes('circlek')) {
            routeData[route].circleKDeliveries++;
            routeData[route].circleKTimes.push(timeStr);
            dailyData[updateDate].circleKTimes.push(timeStr);
          } else if (shopLower.includes('starbucks')) {
            routeData[route].starbucksDeliveries++;
            routeData[route].starbucksTimes.push(timeStr);
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
      const avgTime = this.calculateAverageTime(data.deliveryTimes);
      const circleKAvgTime = this.calculateAverageTime(data.circleKTimes);
      const starbucksAvgTime = this.calculateAverageTime(data.starbucksTimes);
      
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
        averageDeliveryTime: avgTime,
        totalDeliveries: Math.round(weeklyAvgTotalDeliveries * 10) / 10, // Round to 1 decimal
        outstandingDeliveries: Math.round(weeklyAvgOutstandingDeliveries * 10) / 10, // Round to 1 decimal
        problemRate: Math.round(weeklyProblemRate * 100) / 100, // Round to 2 decimals
        circleKDeliveries: data.circleKDeliveries,
        starbucksDeliveries: data.starbucksDeliveries,
        circleKAvgTime: circleKAvgTime,
        starbucksAvgTime: starbucksAvgTime
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
            label: 'Circle K Avg Delivery Time',
            data: circleKData,
            backgroundColor: 'rgba(45, 140, 255, 0.7)',
            borderColor: 'rgba(45, 140, 255, 1)',
            borderWidth: 1,
            barThickness: 20,
            maxBarThickness: 25
          },
          {
            label: 'Starbucks Avg Delivery Time',
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
            text: 'Average Delivery Times by Route (Circle K vs Starbucks)',
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
      const doc = new jsPDF();
      const today = new Date().toLocaleDateString('en-US', { 
        year: 'numeric', 
        month: 'short', 
        day: 'numeric' 
      });
      
      // Add title
      doc.setFontSize(14);
      doc.text('Combined Driver Delivery Updates Report', 14, 15);
      doc.setFontSize(8);
      doc.text(`Date: ${today} | Total Updates: ${updates.length}`, 14, 20);
      
      let yPosition = 25;
      
      // Define colors for all tables
      const lightBlue: [number, number, number] = [200, 220, 240];
      const headerBlue: [number, number, number] = [45, 140, 255];
      
      // 1. Outstanding deliveries section
      const storesWithDeliveries = updates.filter(update => 
        update.delivery_data && 
        Array.isArray(update.delivery_data) && 
        update.delivery_data.some((delivery: any) => delivery.stores && delivery.stores.length > 0)
      );
      
      if (storesWithDeliveries.length > 0) {
        doc.setFontSize(9);
        doc.setFont("helvetica", 'bold');
        doc.text('Delivery Update - Outstanding Deliveries', 14, yPosition);
        doc.setFont("helvetica", 'normal');
        yPosition += 5;
        
        const allStoresData: any[] = [];
        
        storesWithDeliveries.forEach(update => {
          const routeName = update.route_name || 'N/A';
          if (update.delivery_data && Array.isArray(update.delivery_data)) {
            update.delivery_data.forEach((delivery: any) => {
              if (delivery.stores && Array.isArray(delivery.stores)) {
                delivery.stores.forEach((store: any) => {
                  allStoresData.push([
                    delivery.shop_name || 'N/A',
                    routeName,
                    store.store_name || 'N/A',
                    store.store_code || 'N/A'
                  ]);
                });
              }
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
          
          const uniqueRoutes = Array.from(new Set(allStoresData.map((row: any[]) => row[1])));
          
          autoTable(doc, {
            startY: yPosition,
            head: [['Shop', 'Route', 'Store Name', 'Store Code']],
            body: allStoresData as unknown as RowInput[],
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
                
                const routeIndex = uniqueRoutes.indexOf(route);
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
        
        yPosition += 5;
      }
      
      // Save the PDF
      const fileName = `driver-updates-${today.replace(/\s/g, '-')}.pdf`;
      doc.save(fileName);
      
    } catch (error) {
      console.error('Error generating PDF:', error);
      alert('Error generating PDF. Please try again.');
    }
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