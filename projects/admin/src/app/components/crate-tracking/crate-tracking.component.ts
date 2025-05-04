import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Chart, ChartConfiguration, ChartType, registerables } from 'chart.js';
import { SupabaseService } from '../../services/supabase.service';

// Register all Chart.js components
Chart.register(...registerables);

@Component({
  selector: 'app-crate-tracking',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './crate-tracking.component.html',
  styleUrls: ['./crate-tracking.component.scss']
})
export class CrateTrackingComponent implements OnInit {
  chart: Chart | undefined;
  driverSummaryChart: Chart | undefined;
  allCrateData: any[] = [];
  filteredCrateData: any[] = [];
  isLoading = true;
  migrationStatus: string | null = null;
  
  // For driver-specific data
  driverData: Record<string, any[]> = {};
  
  // Filter options
  years: number[] = [];
  months: string[] = [
    'All Months', 'January', 'February', 'March', 'April', 'May', 'June', 
    'July', 'August', 'September', 'October', 'November', 'December'
  ];
  drivers: string[] = ['All Drivers'];
  
  // Selected filter values
  selectedYear: number = new Date().getFullYear();
  selectedMonth: string = 'All Months';
  selectedDriver: string = 'All Drivers';

  constructor(private supabaseService: SupabaseService) {}

  async ngOnInit() {
    this.initializeYears();
    await this.loadCrateData();
    // If no data exists, try to migrate from driver forms
    if (this.allCrateData.length === 0) {
      await this.migrateDriverFormData();
      await this.loadCrateData(); // Reload data after migration
    }
    this.applyFilters();
  }

  initializeYears() {
    const currentYear = new Date().getFullYear();
    this.years = [currentYear, currentYear - 1];
  }

  async loadCrateData() {
    try {
      this.isLoading = true;
      
      // Fetch crate data from Supabase
      const { data, error } = await this.supabaseService.getCrateTrackingData();
      if (error) throw error;
      
      console.log('Raw crate data from database:', data);
      
      if (!data || data.length === 0) {
        console.warn('No crate tracking data received from API');
        this.allCrateData = [];
        this.drivers = ['All Drivers'];
        return;
      }
      
      // Transform data to ensure numeric values for crates
      this.allCrateData = data.map(item => ({
        ...item,
        cratesOut: parseInt(item.cratesOut) || 0,
        cratesIn: parseInt(item.cratesIn) || 0
      }));
      
      // Extract unique drivers for filter
      const uniqueDrivers = new Set<string>();
      this.allCrateData.forEach(item => {
        if (item.driver_name) {
          uniqueDrivers.add(item.driver_name);
        }
      });
      this.drivers = ['All Drivers', ...Array.from(uniqueDrivers)];
      
      // Organize data by driver for graphing
      this.organizeDataByDriver();
      
      // Print summary of data loaded for debugging
      console.log('Total crates out from database:', this.allCrateData.reduce((sum, item) => sum + (item.cratesOut || 0), 0));
      console.log('Total crates in from database:', this.allCrateData.reduce((sum, item) => sum + (item.cratesIn || 0), 0));
      console.log('Driver data:', this.driverData);
    } catch (error) {
      console.error('Error loading crate data:', error);
      this.allCrateData = [];
      this.drivers = ['All Drivers'];
    } finally {
      this.isLoading = false;
    }
  }
  
  organizeDataByDriver() {
    // Reset driver data
    this.driverData = {};
    
    // Group data by driver - use all crate data, not just filtered data
    this.allCrateData.forEach(item => {
      const driverName = item.driver_name || 'Unknown';
      
      if (!this.driverData[driverName]) {
        this.driverData[driverName] = [];
      }
      
      this.driverData[driverName].push(item);
    });
    
    console.log('Driver data organized:', 
      Object.keys(this.driverData).map(driver => ({
        driver,
        recordCount: this.driverData[driver].length,
        totalOut: this.getTotalByDriver(driver, 'cratesOut'),
        totalIn: this.getTotalByDriver(driver, 'cratesIn')
      }))
    );
  }

  applyFilters() {
    console.log('Applying filters:', {
      year: this.selectedYear,
      month: this.selectedMonth,
      driver: this.selectedDriver
    });
    
    // Reset charts if they exist
    if (this.chart) {
      this.chart.destroy();
      this.chart = undefined;
    }
    
    if (this.driverSummaryChart) {
      this.driverSummaryChart.destroy();
      this.driverSummaryChart = undefined;
    }
    
    // First filter by year
    let filtered = this.allCrateData;
    
    if (this.selectedYear) {
      filtered = filtered.filter(item => {
        const itemDate = new Date(item.date);
        return itemDate.getFullYear() === this.selectedYear;
      });
    }
    
    // Then filter by month if not "All Months"
    if (this.selectedMonth !== 'All Months') {
      const monthIndex = this.months.indexOf(this.selectedMonth) - 1;
      if (monthIndex >= 0) {
        filtered = filtered.filter(item => {
          const itemDate = new Date(item.date);
          return itemDate.getMonth() === monthIndex;
        });
      }
    }
    
    // Then filter by driver if not "All Drivers"
    if (this.selectedDriver !== 'All Drivers') {
      filtered = filtered.filter(item => item.driver_name === this.selectedDriver);
    }
    
    this.filteredCrateData = filtered;
    console.log(`Filtered data: ${this.filteredCrateData.length} records`);
    
    // Initialize charts based on filters
    try {
      // Main chart changes based on selected driver
      if (this.selectedDriver !== 'All Drivers') {
        this.initializeDriverChart();
      } else {
        this.initializeOverviewChart();
      }
      
      // Always initialize the driver summary chart with a delay to ensure DOM is ready
      setTimeout(() => {
        try {
          this.initializeDriverSummaryChart();
        } catch (error) {
          console.error('Error during delayed driver summary chart initialization:', error);
        }
      }, 500);
    } catch (error) {
      console.error('Error during chart initialization:', error);
    }
  }

  async migrateDriverFormData() {
    try {
      this.migrationStatus = "Migrating data from driver forms...";
      const result = await this.supabaseService.migrateCrateDataFromDriverForms();
      if (result.success) {
        this.migrationStatus = `Successfully migrated crate data from ${result.processed} date(s)`;
      } else {
        this.migrationStatus = `Migration completed with some issues. Success: ${result.succeeded}, Failed: ${result.failed}`;
      }
      console.log('Migration result:', result);
      
      setTimeout(() => {
        this.migrationStatus = null;
      }, 5000);
    } catch (error) {
      console.error('Error during migration:', error);
      this.migrationStatus = "Failed to migrate data";
      
      setTimeout(() => {
        this.migrationStatus = null;
      }, 5000);
    }
  }

  getTotalCratesOut(): number {
    return this.filteredCrateData.reduce((sum, item) => sum + (item.cratesOut || 0), 0);
  }

  getTotalCratesIn(): number {
    return this.filteredCrateData.reduce((sum, item) => sum + (item.cratesIn || 0), 0);
  }

  getNetMovement(): number {
    return this.getTotalCratesIn() - this.getTotalCratesOut();
  }
  
  getTotalByDriver(driverName: string, type: 'cratesOut' | 'cratesIn'): number {
    const driverRecords = this.driverData[driverName] || [];
    return driverRecords.reduce((sum, item) => sum + (item[type] || 0), 0);
  }

  initializeOverviewChart() {
    const ctx = document.getElementById('crateChart') as HTMLCanvasElement;
    if (!ctx) {
      console.error('Could not find crateChart canvas element');
      return;
    }

    // Cleanup any existing chart
    if (this.chart) {
      this.chart.destroy();
      this.chart = undefined;
    }

    if (this.filteredCrateData.length === 0) {
      console.warn('No crate data available for overview chart');
      return;
    }

    try {
      // Sort data chronologically
      this.filteredCrateData.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
      
      // Group data by date to combine multiple entries for the same date
      const groupedData = this.groupDataByDate(this.filteredCrateData);
      
      // Format dates for display
      const formattedLabels = Object.keys(groupedData).map(date => this.formatDateForDisplay(date));
      
      // Get the actual data values for each date
      const cratesOutData = Object.values(groupedData).map(d => d.cratesOut);
      const cratesInData = Object.values(groupedData).map(d => d.cratesIn);
      
      console.log('Real database chart data:', {
        dates: formattedLabels,
        cratesOut: cratesOutData,
        cratesIn: cratesInData
      });
      
      // Prepare data for the time series chart
      const config: ChartConfiguration = {
        type: 'line' as ChartType,
        data: {
          labels: formattedLabels,
          datasets: [
            {
              label: 'Crates Out',
              data: cratesOutData,
              borderColor: '#e74c3c',
              backgroundColor: 'rgba(231, 76, 60, 0.1)',
              tension: 0.4,
              fill: true
            },
            {
              label: 'Crates In',
              data: cratesInData,
              borderColor: '#27ae60',
              backgroundColor: 'rgba(39, 174, 96, 0.1)',
              tension: 0.4,
              fill: true
            }
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: {
              position: 'top',
            },
            title: {
              display: true,
              text: 'Crate Movement Tracking - All Drivers'
            }
          },
          scales: {
            y: {
              beginAtZero: true,
              title: {
                display: true,
                text: 'Number of Crates'
              }
            },
            x: {
              title: {
                display: true,
                text: 'Date'
              }
            }
          }
        }
      };

      this.chart = new Chart(ctx, config);
      console.log('Overview chart initialized with real database data');
    } catch (error) {
      console.error('Error initializing overview chart:', error);
    }
  }
  
  // Helper function to group data by date
  private groupDataByDate(data: any[]) {
    const grouped: Record<string, {cratesOut: number, cratesIn: number}> = {};
    
    data.forEach(item => {
      const date = item.date;
      if (!grouped[date]) {
        grouped[date] = {
          cratesOut: 0,
          cratesIn: 0
        };
      }
      
      grouped[date].cratesOut += (Number(item.cratesOut) || 0);
      grouped[date].cratesIn += (Number(item.cratesIn) || 0);
    });
    
    return grouped;
  }
  
  // Helper function to format dates for display
  private formatDateForDisplay(dateStr: string): string {
    try {
      const date = new Date(dateStr);
      return date.toLocaleDateString('en-GB', {
        day: 'numeric',
        month: 'short',
        year: 'numeric'
      });
    } catch (e) {
      console.error('Error formatting date:', e);
      return dateStr;
    }
  }
  
  initializeDriverChart() {
    const ctx = document.getElementById('crateChart') as HTMLCanvasElement;
    if (!ctx) {
      console.error('Could not find crateChart canvas element');
      return;
    }
    
    // Cleanup any existing chart
    if (this.chart) {
      this.chart.destroy();
      this.chart = undefined;
    }

    if (this.filteredCrateData.length === 0) {
      console.warn('No crate data available for driver chart');
      return;
    }
    
    try {
      // Sort driver data chronologically
      const driverRecords = [...this.filteredCrateData];
      driverRecords.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
      
      // Group data by date to combine multiple entries for the same date
      const groupedData = this.groupDataByDate(driverRecords);
      
      // Format dates for display
      const formattedLabels = Object.keys(groupedData).map(date => this.formatDateForDisplay(date));
      
      // Get the actual data values for each date
      const cratesOutData = Object.values(groupedData).map(d => d.cratesOut);
      const cratesInData = Object.values(groupedData).map(d => d.cratesIn);
      
      console.log('Real database driver chart data:', {
        driver: this.selectedDriver,
        dates: formattedLabels,
        cratesOut: cratesOutData,
        cratesIn: cratesInData
      });
      
      // Prepare data for the driver-specific chart
      const config: ChartConfiguration = {
        type: 'line' as ChartType,
        data: {
          labels: formattedLabels,
          datasets: [
            {
              label: 'Crates Out',
              data: cratesOutData,
              borderColor: '#e74c3c',
              backgroundColor: 'rgba(231, 76, 60, 0.1)',
              tension: 0.4,
              fill: true
            },
            {
              label: 'Crates In',
              data: cratesInData,
              borderColor: '#27ae60',
              backgroundColor: 'rgba(39, 174, 96, 0.1)',
              tension: 0.4,
              fill: true
            }
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: {
              position: 'top',
            },
            title: {
              display: true,
              text: `Crate Movement Tracking - ${this.selectedDriver}`
            }
          },
          scales: {
            y: {
              beginAtZero: true,
              title: {
                display: true,
                text: 'Number of Crates'
              }
            },
            x: {
              title: {
                display: true,
                text: 'Date'
              }
            }
          }
        }
      };

      this.chart = new Chart(ctx, config);
      console.log('Driver chart initialized with real database data');
    } catch (error) {
      console.error('Error initializing driver chart:', error);
    }
  }
  
  // New function to render driver summary chart
  initializeDriverSummaryChart() {
    const ctx = document.getElementById('driverSummaryChart') as HTMLCanvasElement;
    if (!ctx) {
      console.error('Could not find driverSummaryChart canvas element');
      return;
    }
    
    // Cleanup any existing chart
    if (this.driverSummaryChart) {
      this.driverSummaryChart.destroy();
      this.driverSummaryChart = undefined;
    }
    
    // Get all drivers with data - use driverData which has ALL drivers, not just filtered ones
    const driversWithData = Object.keys(this.driverData).filter(
      driver => this.getTotalByDriver(driver, 'cratesIn') > 0 || this.getTotalByDriver(driver, 'cratesOut') > 0
    );
    
    if (driversWithData.length === 0) {
      console.warn('No driver data available for summary chart');
      return;
    }
    
    try {
      // Sort drivers by total crates for better visualization
      driversWithData.sort((a, b) => {
        const totalA = this.getTotalByDriver(a, 'cratesOut') + this.getTotalByDriver(a, 'cratesIn');
        const totalB = this.getTotalByDriver(b, 'cratesOut') + this.getTotalByDriver(b, 'cratesIn');
        return totalB - totalA; // Sort in descending order
      });
      
      // Get real data for each driver
      const cratesOutData = driversWithData.map(driver => this.getTotalByDriver(driver, 'cratesOut'));
      const cratesInData = driversWithData.map(driver => this.getTotalByDriver(driver, 'cratesIn'));
      
      console.log('Real database driver summary data:', {
        drivers: driversWithData,
        cratesOut: cratesOutData,
        cratesIn: cratesInData
      });
      
      const config: ChartConfiguration = {
        type: 'bar' as ChartType,
        data: {
          labels: driversWithData,
          datasets: [
            {
              label: 'Crates Out',
              data: cratesOutData,
              backgroundColor: 'rgba(231, 76, 60, 0.7)',
              borderColor: '#e74c3c',
              borderWidth: 1
            },
            {
              label: 'Crates In',
              data: cratesInData,
              backgroundColor: 'rgba(39, 174, 96, 0.7)',
              borderColor: '#27ae60',
              borderWidth: 1
            }
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: {
              position: 'top',
            },
            title: {
              display: true,
              text: 'Crate Movement by Driver'
            }
          },
          scales: {
            y: {
              beginAtZero: true,
              title: {
                display: true,
                text: 'Number of Crates'
              }
            },
            x: {
              title: {
                display: true,
                text: 'Driver'
              }
            }
          }
        }
      };

      // Create a new chart
      this.driverSummaryChart = new Chart(ctx, config);
      console.log('Driver summary chart initialized with real database data');
    } catch (error) {
      console.error('Error initializing driver summary chart:', error);
    }
  }

  // Method to handle refresh button click
  async refreshData() {
    this.isLoading = true;
    this.migrationStatus = "Refreshing crate data...";
    
    try {
      // Try the new direct copy method first
      const directCopyResult = await this.supabaseService.copyAllCrateDataFromDriverForms();
      
      if (directCopyResult.success) {
        this.migrationStatus = `Successfully copied ${directCopyResult.count} crate records from driver forms!`;
      } else {
        // Fall back to the original methods if direct copy fails
        await this.supabaseService.fixCrateColumnNames();
        await this.migrateDriverFormData();
      }
      
      // Then reload all crate data
      await this.loadCrateData();
      
      // Apply filters to update charts
      this.applyFilters();
      
      if (!this.migrationStatus.includes('Successfully')) {
        this.migrationStatus = "Data refreshed successfully!";
      }
      
      setTimeout(() => {
        this.migrationStatus = null;
      }, 5000);
    } catch (error) {
      console.error('Error refreshing data:', error);
      this.migrationStatus = "Error refreshing data. Please try again.";
      setTimeout(() => {
        this.migrationStatus = null;
      }, 5000);
    } finally {
      this.isLoading = false;
    }
  }

  // New function to perform a direct copy of all crate data
  async performDirectCrateCopy() {
    this.isLoading = true;
    this.migrationStatus = "Performing direct copy of ALL crate data from driver forms...";
    
    try {
      const result = await this.supabaseService.copyAllCrateDataFromDriverForms();
      
      if (result.success) {
        this.migrationStatus = `Successfully copied ${result.count} crate records directly from driver forms!`;
      } else {
        this.migrationStatus = "Error copying crate data directly. See console for details.";
      }
      
      // Reload data and update charts
      await this.loadCrateData();
      this.applyFilters();
      
      setTimeout(() => {
        this.migrationStatus = null;
      }, 5000);
    } catch (error) {
      console.error('Error performing direct crate copy:', error);
      this.migrationStatus = "Error copying crate data. Please try again.";
      setTimeout(() => {
        this.migrationStatus = null;
      }, 5000);
    } finally {
      this.isLoading = false;
    }
  }
} 