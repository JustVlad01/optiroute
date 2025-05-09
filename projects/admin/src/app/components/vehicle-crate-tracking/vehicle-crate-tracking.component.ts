import { Component, OnInit, AfterViewInit, ElementRef, ViewChild, OnDestroy, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { SupabaseService } from '../../services/supabase.service';
import { Chart, ChartConfiguration, ChartEvent, ChartType, registerables } from 'chart.js';
import { format } from 'date-fns';
import { Router, NavigationEnd } from '@angular/router';
import { Subscription, filter } from 'rxjs';

// Register all Chart.js components
Chart.register(...registerables);

@Component({
  selector: 'app-vehicle-crate-tracking',
  standalone: true,
  imports: [CommonModule, FormsModule, ReactiveFormsModule],
  templateUrl: './vehicle-crate-tracking.component.html',
  styleUrls: ['./vehicle-crate-tracking.component.scss']
})
export class VehicleCrateTrackingComponent implements OnInit, AfterViewInit, OnDestroy {
  @ViewChild('crateChart') crateChartCanvas?: ElementRef<HTMLCanvasElement>;
  
  chart?: Chart;
  loading = true;
  error = '';
  dateRange: { startDate: string; endDate: string };
  
  // Data for the chart
  cratesOutData: {date: string, count: number}[] = [];
  cratesInData: {date: string, count: number}[] = [];
  
  // Subscription for router events
  private routerSubscription?: Subscription;
  
  constructor(
    private supabaseService: SupabaseService,
    private router: Router
  ) {
    // Initialize date range with a default 30-day period
    const today = new Date();
    const thirtyDaysAgo = new Date(today);
    thirtyDaysAgo.setDate(today.getDate() - 30);
    
    this.dateRange = {
      startDate: this.getFormattedDate(thirtyDaysAgo),
      endDate: this.getFormattedDate(today)
    };
  }
  
  ngOnInit(): void {
    this.loadCrateData();
    
    // Subscribe to router events to refresh data when navigating to this page
    this.routerSubscription = this.router.events.pipe(
      filter(event => event instanceof NavigationEnd)
    ).subscribe((event: any) => {
      // Check if the navigation is to this page
      if (event.url.includes('/vehicle-crate-tracking')) {
        console.log('Vehicle Crate Tracking page activated, refreshing data');
        this.loadCrateData();
      }
    });
  }
  
  ngAfterViewInit(): void {
    // Short delay to ensure DOM is ready
    setTimeout(() => {
      this.initializeChart();
    }, 300);
  }
  
  ngOnDestroy(): void {
    // Clean up subscriptions to prevent memory leaks
    if (this.routerSubscription) {
      this.routerSubscription.unsubscribe();
    }
    
    // Destroy chart instance if it exists
    if (this.chart) {
      this.chart.destroy();
    }
  }
  
  // Listen for window resize events to redraw the chart
  @HostListener('window:resize')
  onResize(): void {
    if (this.chart) {
      // Wait for resize to complete before updating
      setTimeout(() => {
        this.chart?.resize();
      }, 100);
    }
  }

  getFormattedDate(date: Date): string {
    return format(date, 'yyyy-MM-dd');
  }
  
  async loadCrateData(): Promise<void> {
    try {
      this.loading = true;
      console.log('Loading crate data with date range:', this.dateRange);
      
      // Get driver forms for the selected date range
      const forms = await this.supabaseService.getDriverFormsByDateRange(
        this.dateRange.startDate,
        this.dateRange.endDate
      );
      
      if (forms) {
        console.log(`Retrieved ${forms.length} driver forms`);
        this.processFormData(forms);
        this.updateChart();
      } else {
        console.error('No data returned from server');
        this.error = 'No data available for the selected date range';
      }
    } catch (err) {
      console.error('Error loading crate data:', err);
      this.error = 'Failed to load crate tracking data';
    } finally {
      this.loading = false;
    }
  }
  
  processFormData(forms: any[]): void {
    // Group by date for crates out
    const cratesOutMap = new Map<string, number>();
    const cratesInMap = new Map<string, number>();
    
    forms.forEach(form => {
      const formDate = form.date;
      
      // Process crates out (all forms should have this)
      if (form.number_of_crates_out) {
        const currentOut = cratesOutMap.get(formDate) || 0;
        cratesOutMap.set(formDate, currentOut + form.number_of_crates_out);
      }
      
      // Process crates in (might be null in some forms)
      if (form.number_of_crates_in) {
        const currentIn = cratesInMap.get(formDate) || 0;
        cratesInMap.set(formDate, currentIn + form.number_of_crates_in);
      }
    });
    
    // Convert maps to sorted arrays
    this.cratesOutData = Array.from(cratesOutMap.entries())
      .map(([date, count]) => ({ date, count }))
      .sort((a, b) => a.date.localeCompare(b.date));
    
    this.cratesInData = Array.from(cratesInMap.entries())
      .map(([date, count]) => ({ date, count }))
      .sort((a, b) => a.date.localeCompare(b.date));
  }
  
  initializeChart(): void {
    if (!this.crateChartCanvas) return;
    
    const ctx = this.crateChartCanvas.nativeElement.getContext('2d');
    if (!ctx) return;
    
    const labels = this.getUniqueOrderedDates();
    
    const data = {
      labels,
      datasets: [
        {
          label: 'Crates Out',
          data: this.getDataForDates(labels, this.cratesOutData),
          borderColor: '#3498db',
          backgroundColor: 'rgba(52, 152, 219, 0.2)',
          borderWidth: 2,
          tension: 0.3,
          pointRadius: 3,
          pointBackgroundColor: '#3498db'
        },
        {
          label: 'Crates In',
          data: this.getDataForDates(labels, this.cratesInData),
          borderColor: '#e74c3c',
          backgroundColor: 'rgba(231, 76, 60, 0.2)',
          borderWidth: 2,
          tension: 0.3,
          pointRadius: 3,
          pointBackgroundColor: '#e74c3c'
        }
      ]
    };
    
    const config: ChartConfiguration = {
      type: 'line' as ChartType,
      data,
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: {
          intersect: false,
          mode: 'index',
        },
        scales: {
          y: {
            beginAtZero: true,
            grid: {
              color: 'rgba(0, 0, 0, 0.05)',
            },
            ticks: {
              font: {
                size: 10
              }
            }
          },
          x: {
            grid: {
              display: false
            },
            ticks: {
              font: {
                size: 10
              },
              maxRotation: 45,
              minRotation: 45
            }
          }
        },
        plugins: {
          legend: {
            position: 'top',
            labels: {
              boxWidth: 12,
              font: {
                size: 11
              }
            }
          },
          tooltip: {
            backgroundColor: 'rgba(44, 62, 80, 0.9)',
            titleFont: {
              size: 12
            },
            bodyFont: {
              size: 11
            },
            padding: 8,
            cornerRadius: 4
          }
        }
      }
    };
    
    this.chart = new Chart(ctx, config);
  }
  
  getUniqueOrderedDates(): string[] {
    // Combine dates from both datasets and get unique values
    const allDates = [
      ...this.cratesOutData.map(item => item.date),
      ...this.cratesInData.map(item => item.date)
    ];
    
    return [...new Set(allDates)].sort();
  }
  
  getDataForDates(dates: string[], dataArray: {date: string, count: number}[]): number[] {
    // Create a map for quick lookup
    const dataMap = new Map(dataArray.map(item => [item.date, item.count]));
    
    // Return counts for each date, or 0 if no data
    return dates.map(date => dataMap.get(date) || 0);
  }
  
  updateChart(): void {
    if (!this.chart) {
      this.initializeChart();
      return;
    }
    
    try {
      const labels = this.getUniqueOrderedDates();
      
      if (labels.length === 0) {
        console.warn('No data available for chart');
        if (this.chart) {
          this.chart.data.labels = [];
          this.chart.data.datasets[0].data = [];
          this.chart.data.datasets[1].data = [];
          this.chart.update();
        }
        return;
      }
      
      console.log('Updating chart with new data');
      this.chart.data.labels = labels;
      this.chart.data.datasets[0].data = this.getDataForDates(labels, this.cratesOutData);
      this.chart.data.datasets[1].data = this.getDataForDates(labels, this.cratesInData);
      
      this.chart.update();
      console.log('Chart updated successfully');
    } catch (err) {
      console.error('Error updating chart:', err);
      this.error = 'Failed to update chart with new data';
    }
  }
  
  async refreshData(): Promise<void> {
    // Clear any existing error
    this.error = '';
    
    // Show loading indicator
    this.loading = true;
    
    try {
      await this.loadCrateData();
      console.log('Data refreshed successfully');
    } catch (err) {
      console.error('Error refreshing data:', err);
      this.error = 'Failed to refresh data';
    } finally {
      this.loading = false;
    }
  }

  // Methods for template calculations
  getTotalCratesOut(): number {
    return this.cratesOutData.reduce((sum, item) => sum + item.count, 0);
  }

  getTotalCratesIn(): number {
    return this.cratesInData.reduce((sum, item) => sum + item.count, 0);
  }

  getBalance(): number {
    return this.getTotalCratesIn() - this.getTotalCratesOut();
  }

  isBalancePositive(): boolean {
    return this.getBalance() >= 0;
  }

  isBalanceNegative(): boolean {
    return this.getBalance() < 0;
  }
} 