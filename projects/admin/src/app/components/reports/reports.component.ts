import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { SupabaseService } from '../../services/supabase.service';
import { NotificationService } from '../../services/notification.service';
import { PdfReportService } from '../../services/pdf-report.service';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import autoTable, { RowInput, CellHookData } from 'jspdf-autotable';
import { Chart, ChartConfiguration, ChartType, registerables } from 'chart.js';
import * as XLSX from 'xlsx';

// Register Chart.js components
Chart.register(...registerables);

interface AccidentReport {
  id: number;
  created_at: string;
  date_of_collision: string;
  location_of_collision: any;
  
  // My vehicle details
  my_driver_name: string;
  my_vehicle_make: string;
  my_vehicle_registration: string;
  my_vehicle_colour: string;
  my_vehicle_address?: string;
  my_transport_contact?: string;
  my_insurance_details?: string;
  my_policy_number?: string;
  
  // Other vehicle details
  other_driver_name: string;
  other_vehicle_make: string;
  other_vehicle_registration: string;
  other_vehicle_colour: string;
  other_vehicle_address?: string;
  other_vehicle_owner?: string;
  other_vehicle_owner_address?: string;
  other_insurance_details?: string;
  other_policy_number?: string;
  
  // Damage and injuries
  other_damage_description: string;
  my_injuries: string;
  
  // Metadata
  submit_success: boolean;
  session_id: string;
  images?: AccidentImage[];
  accident_report_images?: AccidentImage[]; // Raw data from Supabase join
}

interface AccidentImage {
  id: number;
  storage_bucket_path: string;
  storage_bucket_url: string;
  original_filename: string;
  image_order: number;
  uploaded_at: string;
}

// Driver Updates interfaces
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

// Van Issues interfaces
interface VanIssue {
  id: string;
  driver_id: string;
  van_registration: string;
  driver_comments: string;
  image_urls: string[];
  created_at: string;
  verified: boolean;
  verified_at?: string;
  verified_by?: string;
  verification_notes?: string;
  date_fixed?: string;
  driver_name?: string;
  driver_custom_id?: string;
  driver_phone?: string;
  driver_location?: string;
}

@Component({
  selector: 'app-reports',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './reports.component.html',
  styleUrls: ['./reports.component.scss']
})
export class ReportsComponent implements OnInit, OnDestroy {
  // Tab management
  activeTab: 'accident-reports' | 'driver-updates' | 'van-issues' = 'accident-reports';

  // Accident Reports properties
  reports: AccidentReport[] = [];
  selectedReport: AccidentReport | null = null;
  isLoading = true;
  error: string = '';
  
  // Filters
  dateFilter: string = '';
  searchTerm: string = '';
  
  // Pagination
  currentPage = 1;
  itemsPerPage = 10;
  totalReports = 0;
  
  // View modes
  viewMode: 'list' | 'detail' = 'list';
  selectedImageUrl: string = '';
  showImageModal = false;

  // Driver Updates properties
  driverUpdates: any[] = [];
  driverLoading: boolean = true;
  selectedDriverUpdate: any = null;
  startOfToday: string;
  endOfToday: string;
  page: number = 0;
  pageSize: number = 10;
  totalCount: number = 0;
  driverViewMode: 'list' | 'detail' = 'list';
  Math = Math;
  selectedStores: SelectedStore[] = [];
  selectedUpdates: Set<number> = new Set(); // Track selected updates by ID
  
  // New properties for day grouping
  dayGroups: DayGroup[] = [];
  dateRange: number = 4; // Show last 4 days by default
  startDate: string;
  endDate: string;

  // Analytics properties
  routeAnalytics: RouteAnalytics[] = [];
  dailyDeliveryData: DailyDeliveryData[] = [];
  deliveryTimeChart: Chart | null = null;
  problemRouteChart: Chart | null = null;
  weeklyTrendChart: Chart | null = null;
  showAnalytics: boolean = true;

  // Export date range properties
  exportStartDate: string = '';
  exportEndDate: string = '';

  // Van Issues properties
  vanIssues: VanIssue[] = [];
  vanIssuesLoading = true;
  selectedImage: string | null = null;
  selectedIssue: VanIssue | null = null;
  verificationNotes: { [key: string]: string } = {};
  isVerifying: { [key: string]: boolean } = {};
  
  // Date picker modal properties
  showDateModal = false;
  selectedIssueForVerification: VanIssue | null = null;
  fixedDate: string = '';

  // PDF Report properties
  showReportModal = false;
  reportFilters = {
    status: 'all' as 'all' | 'verified' | 'pending',
    dateRange: {
      start: '',
      end: ''
    },
    vehicles: [] as string[]
  };
  availableVehicles: string[] = [];
  isGeneratingReport = false;

  constructor(
    private router: Router,
    private supabaseService: SupabaseService,
    private notificationService: NotificationService,
    private pdfReportService: PdfReportService
  ) {
    // Set date range for the last 4 days
    const today = new Date();
    today.setHours(23, 59, 59, 999);
    this.endDate = today.toISOString();
    
    const daysAgo = new Date(today);
    daysAgo.setDate(daysAgo.getDate() - this.dateRange);
    daysAgo.setHours(0, 0, 0, 0);
    this.startDate = daysAgo.toISOString();
    
    // Keep the original today range for backward compatibility
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    this.startOfToday = todayStart.toISOString();
    
    const tomorrow = new Date(todayStart);
    tomorrow.setDate(tomorrow.getDate() + 1);
    this.endOfToday = tomorrow.toISOString();
  }

  async ngOnInit(): Promise<void> {
    await this.loadReports();
    await this.loadUpdatesGroupedByDay();
    await this.loadVanIssues();
  }

  // Tab management methods
  setActiveTab(tab: 'accident-reports' | 'driver-updates' | 'van-issues'): void {
    this.activeTab = tab;
    if (tab === 'driver-updates' && this.dayGroups.length === 0) {
      this.loadUpdatesGroupedByDay();
    } else if (tab === 'van-issues' && this.vanIssues.length === 0) {
      this.loadVanIssues();
    }
  }

  async loadReports(): Promise<void> {
    this.isLoading = true;
    this.error = '';
    
    try {
      const { data, error } = await this.supabaseService.getSupabase()
        .from('accident_reports')
        .select(`
          *,
          accident_report_images (
            id,
            storage_bucket_path,
            storage_bucket_url,
            original_filename,
            image_order,
            uploaded_at
          )
        `)
        .order('created_at', { ascending: false });

      if (error) {
        throw error;
      }

      this.reports = data || [];
      this.totalReports = this.reports.length;
      
      // Process images for each report
      this.reports.forEach(report => {
        if (report.accident_report_images) {
          report.images = report.accident_report_images.sort((a: any, b: any) => a.image_order - b.image_order);
        }
      });

    } catch (error) {
      console.error('Error loading accident reports:', error);
      this.error = 'Failed to load accident reports. Please try again.';
    } finally {
      this.isLoading = false;
    }
  }

  get filteredReports(): AccidentReport[] {
    let filtered = this.reports;

    // Apply search filter
    if (this.searchTerm) {
      const term = this.searchTerm.toLowerCase();
      filtered = filtered.filter(report =>
        report.my_driver_name?.toLowerCase().includes(term) ||
        report.other_driver_name?.toLowerCase().includes(term) ||
        report.my_vehicle_registration?.toLowerCase().includes(term) ||
        report.other_vehicle_registration?.toLowerCase().includes(term)
      );
    }

    // Apply date filter
    if (this.dateFilter) {
      filtered = filtered.filter(report => 
        report.date_of_collision === this.dateFilter
      );
    }

    return filtered;
  }

  get paginatedReports(): AccidentReport[] {
    const filtered = this.filteredReports;
    const startIndex = (this.currentPage - 1) * this.itemsPerPage;
    return filtered.slice(startIndex, startIndex + this.itemsPerPage);
  }

  get totalPages(): number {
    return Math.ceil(this.filteredReports.length / this.itemsPerPage);
  }

  viewReportDetails(report: AccidentReport): void {
    this.selectedReport = report;
    this.viewMode = 'detail';
  }

  backToList(): void {
    this.selectedReport = null;
    this.viewMode = 'list';
  }

  openImageModal(imageUrl: string): void {
    this.selectedImageUrl = imageUrl;
    this.showImageModal = true;
  }

  closeImageModal(): void {
    this.showImageModal = false;
    this.selectedImageUrl = '';
  }

  formatLocation(location: any): string {
    if (typeof location === 'string') {
      return location;
    }
    if (location && location.latitude && location.longitude) {
      return `Lat: ${location.latitude}, Lng: ${location.longitude}`;
    }
    return 'Location not available';
  }

  formatDate(dateString: string): string {
    return new Date(dateString).toLocaleDateString('en-GB', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  formatVanIssueDate(dateString: string): string {
    return new Date(dateString).toLocaleString();
  }

  openInGoogleMaps(location: any): void {
    if (!location) return;
    
    let lat: number, lng: number;
    
    // Handle different location formats
    if (typeof location === 'string') {
      try {
        const parsed = JSON.parse(location);
        lat = parsed.latitude;
        lng = parsed.longitude;
      } catch (e) {
        console.error('Error parsing location string:', e);
        return;
      }
    } else if (location.latitude && location.longitude) {
      lat = location.latitude;
      lng = location.longitude;
    } else {
      console.error('Invalid location format:', location);
      return;
    }
    
    // Open Google Maps with the coordinates
    const googleMapsUrl = `https://www.google.com/maps?q=${lat},${lng}`;
    window.open(googleMapsUrl, '_blank');
  }

  onPageChange(page: number): void {
    this.currentPage = page;
  }

  onFilterChange(): void {
    this.currentPage = 1; // Reset to first page when filters change
  }

  async refreshReports(): Promise<void> {
    await this.loadReports();
  }

  navigateToDashboard(): void {
    this.router.navigate(['/dashboard']);
  }

  async exportReports(): Promise<void> {
    try {
      const { data, error } = await this.supabaseService.getSupabase()
        .from('accident_reports')
        .select(`
          id,
          created_at,
          date_of_collision,
          location_of_collision,
          my_driver_name,
          my_vehicle_make,
          my_vehicle_registration,
          my_vehicle_colour,
          other_driver_name,
          other_vehicle_make,
          other_vehicle_registration,
          other_vehicle_colour,
          other_damage_description,
          my_injuries,
          submit_success
        `)
        .order('created_at', { ascending: false });

      if (error) throw error;

      // Convert to CSV
      const headers = [
        'ID', 'Date Created', 'Collision Date', 'Location', 'Driver Name', 
        'Vehicle Make', 'Vehicle Reg', 'Vehicle Colour', 'Other Driver', 
        'Other Vehicle Make', 'Other Vehicle Reg', 'Other Vehicle Colour',
        'Damage Description', 'Injuries', 'Status'
      ];

      const csvContent = [
        headers.join(','),
        ...data.map(report => [
          report.id,
          this.formatDate(report.created_at),
          report.date_of_collision,
          `"${this.formatLocation(report.location_of_collision)}"`,
          `"${report.my_driver_name || ''}"`,
          `"${report.my_vehicle_make || ''}"`,
          `"${report.my_vehicle_registration || ''}"`,
          `"${report.my_vehicle_colour || ''}"`,
          `"${report.other_driver_name || ''}"`,
          `"${report.other_vehicle_make || ''}"`,
          `"${report.other_vehicle_registration || ''}"`,
          `"${report.other_vehicle_colour || ''}"`,
          `"${report.other_damage_description || ''}"`,
          `"${report.my_injuries || ''}"`,
          report.submit_success ? 'Success' : 'Failed'
        ].join(','))
      ].join('\n');

      // Download CSV
      const blob = new Blob([csvContent], { type: 'text/csv' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `accident-reports-${new Date().toISOString().split('T')[0]}.csv`;
      a.click();
      window.URL.revokeObjectURL(url);

    } catch (error) {
      console.error('Error exporting reports:', error);
      this.error = 'Failed to export reports. Please try again.';
    }
  }

  async downloadPDF(report: AccidentReport): Promise<void> {
    try {
      const pdf = new jsPDF('p', 'mm', 'a4');
      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      const margin = 15; // Reduced margin
      let yPosition = margin;

      // Compact blue header section
      pdf.setFillColor(52, 73, 94);
      pdf.rect(0, 0, pageWidth, 35, 'F'); // Reduced height
      
      // Company name in white
      pdf.setTextColor(255, 255, 255);
      pdf.setFontSize(20); // Reduced font size
      pdf.setFont('helvetica', 'bold');
      pdf.text('AROUND NOON', margin, 20);
      
      // Subtitle in white
      pdf.setFontSize(12); // Reduced font size
      pdf.setFont('helvetica', 'normal');
      pdf.text('Vehicle Accident Report', margin, 28);

      yPosition = 45; // Reduced spacing

      // Compact report details section
      pdf.setFillColor(245, 245, 245);
      pdf.rect(margin, yPosition, pageWidth - 2 * margin, 25, 'F'); // Reduced height
      pdf.setDrawColor(200, 200, 200);
      pdf.rect(margin, yPosition, pageWidth - 2 * margin, 25, 'S');

      pdf.setTextColor(0, 0, 0);
      pdf.setFontSize(10); // Reduced font size
      pdf.setFont('helvetica', 'bold');
      pdf.text(`Report ID: #${report.id}`, margin + 3, yPosition + 8);
      
      const submissionDate = new Date(report.created_at).toLocaleDateString('en-GB', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
      pdf.text(`Submitted: ${submissionDate}`, pageWidth - margin - 70, yPosition + 8);

      pdf.setFontSize(9); // Reduced font size
      pdf.setFont('helvetica', 'normal');
      const collisionDate = new Date(report.date_of_collision).toLocaleDateString('en-GB');
      pdf.text(`Collision Date: ${collisionDate}`, margin + 3, yPosition + 16);
      
      // Compact location info
      let locationHeight = 25; // Default height
      if (report.location_of_collision) {
        let locationText = '';
        try {
          const location = typeof report.location_of_collision === 'string' ? 
            JSON.parse(report.location_of_collision) : report.location_of_collision;
          
          if (location) {
            if (location.latitude && location.longitude) {
              locationText = `GPS: ${location.latitude}, ${location.longitude}`;
              if (location.accuracy) {
                locationText += ` (±${Math.round(location.accuracy)}m)`;
              }
            } else if (location.address) {
              locationText = `Address: ${location.address}`;
            } else if (location.type === 'manual_address') {
              locationText = `Address: ${location.address}`;
            }
          }
        } catch (e) {
          console.error('Error parsing location:', e);
          locationText = 'Location information available';
        }
        
        if (locationText) {
          const locationLines = pdf.splitTextToSize(locationText, pageWidth - 2 * margin - 6);
          locationLines.forEach((line: string, index: number) => {
            pdf.text(line, margin + 3, yPosition + 22 + (index * 4));
          });
          // Adjust height based on number of lines
          if (locationLines.length > 1) {
            locationHeight = 25 + ((locationLines.length - 1) * 4);
          }
        }
      }

      yPosition += locationHeight; // Use calculated height instead of fixed 35

      // Compact blue section header function
      const createCompactBlueSection = (title: string) => {
        pdf.setFillColor(52, 73, 94);
        pdf.rect(margin, yPosition, pageWidth - 2 * margin, 8, 'F'); // Reduced height
        
        pdf.setTextColor(255, 255, 255);
        pdf.setFontSize(10); // Reduced font size
        pdf.setFont('helvetica', 'bold');
        pdf.text(title, margin + 3, yPosition + 6);
        
        yPosition += 10; // Reduced spacing
      };

      // Compact table function for longer text fields
      const createCompactTable = (data: [string, string][]) => {
        const startY = yPosition;
        let currentY = startY + 5;
        const labelWidth = 50;
        const valueWidth = pageWidth - 2 * margin - labelWidth - 10;
        const lineHeight = 4;
        const rowPadding = 2;
        
        // Calculate total height needed
        let totalHeight = 8;
        data.forEach(([label, value]) => {
          if (value && value.length > 40) {
            const lines = pdf.splitTextToSize(value, valueWidth);
            totalHeight += Math.max(8, lines.length * lineHeight + rowPadding * 2);
          } else {
            totalHeight += 8;
          }
        });
        
        // Light background for table
        pdf.setFillColor(250, 250, 250);
        pdf.rect(margin, startY, pageWidth - 2 * margin, totalHeight, 'F');
        pdf.setDrawColor(200, 200, 200);
        pdf.rect(margin, startY, pageWidth - 2 * margin, totalHeight, 'S');
        
        data.forEach(([label, value]) => {
          const rowStartY = currentY;
          
          // Draw label
          pdf.setFont('helvetica', 'bold');
          pdf.setTextColor(52, 73, 94);
          pdf.setFontSize(8);
          pdf.text(label, margin + 3, currentY);
          
          // Draw value
          pdf.setFont('helvetica', 'normal');
          pdf.setTextColor(0, 0, 0);
          pdf.setFontSize(8);
          
          if (value && value.length > 40) {
            // Handle multi-line text
            const lines = pdf.splitTextToSize(value, valueWidth);
            lines.forEach((line: string, index: number) => {
              pdf.text(line, margin + labelWidth + 5, currentY + (index * lineHeight));
            });
            currentY += Math.max(8, lines.length * lineHeight + rowPadding);
          } else {
            pdf.text(value || 'Not provided', margin + labelWidth + 5, currentY);
            currentY += 8;
          }
          
          currentY += rowPadding; // Add padding between rows
        });
        
        yPosition = startY + totalHeight + 15;
      };

      // Super compact table function for short fields (Make, Registration, Color, etc.)
      const createSuperCompactTable = (data: [string, string][]) => {
        const startY = yPosition;
        let currentY = startY + 3;
        const labelWidth = 50;
        const rowHeight = 5; // Much smaller row height
        const rowPadding = 1; // Minimal padding
        
        const totalHeight = data.length * rowHeight + 6;
        
        // Light background for table
        pdf.setFillColor(250, 250, 250);
        pdf.rect(margin, startY, pageWidth - 2 * margin, totalHeight, 'F');
        pdf.setDrawColor(200, 200, 200);
        pdf.rect(margin, startY, pageWidth - 2 * margin, totalHeight, 'S');
        
        data.forEach(([label, value]) => {
          // Draw label
          pdf.setFont('helvetica', 'bold');
          pdf.setTextColor(52, 73, 94);
          pdf.setFontSize(8);
          pdf.text(label, margin + 3, currentY);
          
          // Draw value
          pdf.setFont('helvetica', 'normal');
          pdf.setTextColor(0, 0, 0);
          pdf.setFontSize(8);
          pdf.text(value || 'Not provided', margin + labelWidth + 5, currentY);
          
          currentY += rowHeight;
        });
        
        yPosition = startY + totalHeight + 10;
      };

      // MY VEHICLE DETAILS
      createCompactBlueSection('MY VEHICLE DETAILS');
      
      // Short fields - super compact
      const myVehicleShortData: [string, string][] = [
        ['Make:', report.my_vehicle_make || 'Not provided'],
        ['Registration:', report.my_vehicle_registration || 'Not provided'],
        ['Color:', report.my_vehicle_colour || 'Not provided'],
        ['Driver Name:', report.my_driver_name || 'Not provided']
      ];
      
      createSuperCompactTable(myVehicleShortData);
      
      // Long fields - regular compact
      const myVehicleLongData: [string, string][] = [
        ['Address:', report.my_vehicle_address || 'Not provided'],
        ['Transport Contact:', report.my_transport_contact || 'Not provided'],
        ['Insurance Details:', report.my_insurance_details || 'Not provided'],
        ['Policy Number:', report.my_policy_number || 'Not provided']
      ];
      
      createCompactTable(myVehicleLongData);

      // OTHER VEHICLE DETAILS
      createCompactBlueSection('OTHER VEHICLE DETAILS');
      
      // Short fields - super compact
      const otherVehicleShortData: [string, string][] = [
        ['Make:', report.other_vehicle_make || 'Not provided'],
        ['Registration:', report.other_vehicle_registration || 'Not provided'],
        ['Color:', report.other_vehicle_colour || 'Not provided'],
        ['Driver Name:', report.other_driver_name || 'Not provided']
      ];
      
      createSuperCompactTable(otherVehicleShortData);
      
      // Long fields - regular compact
      const otherVehicleLongData: [string, string][] = [
        ['Driver Address:', report.other_vehicle_address || 'Not provided'],
        ['Vehicle Owner:', report.other_vehicle_owner || 'Not provided'],
        ['Owner Address:', report.other_vehicle_owner_address || 'Not provided'],
        ['Insurance Details:', report.other_insurance_details || 'Not provided'],
        ['Policy Number:', report.other_policy_number || 'Not provided']
      ];
      
      createCompactTable(otherVehicleLongData);

      // DAMAGE & INJURIES - More compact
      if (report.other_damage_description || report.my_injuries) {
        createCompactBlueSection('DAMAGE & INJURIES');
        
        // Compact damage section
        const damageStartY = yPosition;
        let damageHeight = 6;
        
        if (report.other_damage_description) {
          damageHeight += 12; // Reduced height
        }
        if (report.my_injuries) {
          damageHeight += 12; // Reduced height
        }
        
        pdf.setFillColor(250, 250, 250);
        pdf.rect(margin, damageStartY, pageWidth - 2 * margin, damageHeight, 'F');
        pdf.setDrawColor(200, 200, 200);
        pdf.rect(margin, damageStartY, pageWidth - 2 * margin, damageHeight, 'S');
        
        yPosition += 3;
        
        if (report.other_damage_description) {
          pdf.setFont('helvetica', 'bold');
          pdf.setTextColor(52, 73, 94);
          pdf.setFontSize(8); // Reduced font size
          pdf.text('Damage Description:', margin + 3, yPosition);
          yPosition += 4; // Reduced spacing
          
          pdf.setFont('helvetica', 'normal');
          pdf.setTextColor(0, 0, 0);
          pdf.setFontSize(8); // Reduced font size
          const damageLines = pdf.splitTextToSize(report.other_damage_description, pageWidth - 2 * margin - 6);
          pdf.text(damageLines, margin + 3, yPosition);
          yPosition += damageLines.length * 3 + 4; // Reduced spacing
        }

        if (report.my_injuries) {
          pdf.setFont('helvetica', 'bold');
          pdf.setTextColor(52, 73, 94);
          pdf.setFontSize(8); // Reduced font size
          pdf.text('Injuries Description:', margin + 3, yPosition);
          yPosition += 4; // Reduced spacing
          
          pdf.setFont('helvetica', 'normal');
          pdf.setTextColor(0, 0, 0);
          pdf.setFontSize(8); // Reduced font size
          const injuryLines = pdf.splitTextToSize(report.my_injuries, pageWidth - 2 * margin - 6);
          pdf.text(injuryLines, margin + 3, yPosition);
          yPosition += injuryLines.length * 3 + 10; // Reduced spacing
        }
      }

      // Move images to second page
      if (report.images && report.images.length > 0) {
        // Add second page for images
        pdf.addPage();
        yPosition = margin;

        // Blue header for images page
        pdf.setFillColor(52, 73, 94);
        pdf.rect(0, 0, pageWidth, 35, 'F');
        
        pdf.setTextColor(255, 255, 255);
        pdf.setFontSize(20);
        pdf.setFont('helvetica', 'bold');
        pdf.text('AROUND NOON', margin, 20);
        
        pdf.setFontSize(12);
        pdf.setFont('helvetica', 'normal');
        pdf.text('Vehicle Accident Report - Images', margin, 28);

        yPosition = 45;

        createCompactBlueSection('PHOTOGRAPHIC EVIDENCE');

        for (const image of report.images) {
          try {
            // Check if we need a new page for the image
            if (yPosition > pageHeight - 70) {
              pdf.addPage();
              yPosition = margin;
            }

            const imageUrl = image.storage_bucket_url || this.supabaseService.getImageUrl(image.storage_bucket_path);
            
            const img = new Image();
            img.crossOrigin = 'anonymous';
            
            await new Promise((resolve, reject) => {
              img.onload = resolve;
              img.onerror = reject;
              img.src = imageUrl;
            });

            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            canvas.width = img.width;
            canvas.height = img.height;
            ctx?.drawImage(img, 0, 0);

            const imgData = canvas.toDataURL('image/jpeg', 0.9);
            
            // Compact image sizing
            const maxWidth = pageWidth - 2 * margin;
            const maxHeight = 60; // Reduced height
            const imgRatio = img.width / img.height;
            
            let imgWidth = maxWidth;
            let imgHeight = imgWidth / imgRatio;
            
            if (imgHeight > maxHeight) {
              imgHeight = maxHeight;
              imgWidth = imgHeight * imgRatio;
            }

            // Center the image
            const imgX = margin + (maxWidth - imgWidth) / 2;

            // Compact image border
            pdf.setDrawColor(200, 200, 200);
            pdf.setLineWidth(0.5);
            pdf.rect(imgX - 1, yPosition - 1, imgWidth + 2, imgHeight + 2, 'S');

            pdf.addImage(imgData, 'JPEG', imgX, yPosition, imgWidth, imgHeight);
            
            // Compact image caption
            pdf.setFontSize(7); // Reduced font size
            pdf.setFont('helvetica', 'normal');
            pdf.setTextColor(100, 100, 100);
            const caption = image.original_filename || 'Incident Photo';
            const captionWidth = pdf.getTextWidth(caption);
            pdf.text(caption, margin + (maxWidth - captionWidth) / 2, yPosition + imgHeight + 6);
            
            yPosition += imgHeight + 12; // Reduced spacing

          } catch (error) {
            console.error('Error loading image for PDF:', error);
            pdf.setFontSize(7);
            pdf.setFont('helvetica', 'italic');
            pdf.setTextColor(150, 150, 150);
            pdf.text(`Image unavailable: ${image.original_filename || 'Incident Photo'}`, margin, yPosition);
            yPosition += 10; // Reduced spacing
          }
        }
      }

      // Compact footer
      const totalPages = pdf.getNumberOfPages();
      for (let i = 1; i <= totalPages; i++) {
        pdf.setPage(i);
        
        // Footer line
        pdf.setDrawColor(200, 200, 200);
        pdf.setLineWidth(0.3);
        pdf.line(margin, pageHeight - 15, pageWidth - margin, pageHeight - 15);
        
        // Compact footer content
        pdf.setFontSize(7); // Reduced font size
        pdf.setFont('helvetica', 'normal');
        pdf.setTextColor(100, 100, 100);
        
        pdf.text('Generated by Around Noon Admin Dashboard', margin, pageHeight - 8);
        
        const pageText = `Page ${i} of ${totalPages}`;
        const pageTextWidth = pdf.getTextWidth(pageText);
        pdf.text(pageText, pageWidth - margin - pageTextWidth, pageHeight - 8);
      }

      // Save with clean filename
      const filename = `Around-Noon-Report-${report.id}-${new Date().toISOString().split('T')[0]}.pdf`;
      pdf.save(filename);

    } catch (error) {
      console.error('Error generating PDF:', error);
      alert('Error generating PDF report. Please try again.');
    }
  }

  // Driver Updates Methods
  async loadUpdatesGroupedByDay(): Promise<void> {
    this.driverLoading = true;
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
      this.driverLoading = false;
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
    // Process driver updates to calculate analytics
    this.processDeliveryData();
    
    // Create the chart after processing data
    setTimeout(() => {
      this.createDeliveryTimeChart();
    }, 100);
  }

  private processDeliveryData(): void {
    // Initialize daily delivery data for the last 4 days
    this.dailyDeliveryData = [];
    
    // Create entries for each day in the range
    for (let i = this.dateRange - 1; i >= 0; i--) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      const dateKey = date.toISOString().split('T')[0];
      
      let displayDate: string;
      if (i === 0) {
        displayDate = 'Today';
      } else if (i === 1) {
        displayDate = 'Yesterday';
      } else {
        displayDate = date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
      }

      this.dailyDeliveryData.push({
        date: dateKey,
        displayDate,
        circleKAvgTime: null,
        starbucksAvgTime: null,
        circleKCount: 0,
        starbucksCount: 0
      });
    }

    // Process updates to calculate delivery times
    this.driverUpdates.forEach(update => {
      const updateDate = new Date(update.created_at).toISOString().split('T')[0];
      const dayData = this.dailyDeliveryData.find(d => d.date === updateDate);
      
      if (dayData && update.last_delivery_times) {
        // Process last delivery times
        Object.entries(update.last_delivery_times).forEach(([shop, timeStr]) => {
          const time = this.parseTimeToMinutes(timeStr as string);
          if (time > 0) {
            if (shop.toLowerCase().includes('circle k')) {
              if (dayData.circleKAvgTime === null) {
                dayData.circleKAvgTime = time;
                dayData.circleKCount = 1;
              } else {
                dayData.circleKAvgTime = (dayData.circleKAvgTime * dayData.circleKCount + time) / (dayData.circleKCount + 1);
                dayData.circleKCount++;
              }
            } else if (shop.toLowerCase().includes('starbucks')) {
              if (dayData.starbucksAvgTime === null) {
                dayData.starbucksAvgTime = time;
                dayData.starbucksCount = 1;
              } else {
                dayData.starbucksAvgTime = (dayData.starbucksAvgTime * dayData.starbucksCount + time) / (dayData.starbucksCount + 1);
                dayData.starbucksCount++;
              }
            }
          }
        });
      }
    });
  }

  private parseTimeToMinutes(timeStr: string): number {
    // Parse time strings like "10:30" or "9:45" to minutes
    try {
      const [hours, minutes] = timeStr.split(':').map(Number);
      return hours * 60 + minutes;
    } catch (e) {
      return 0;
    }
  }

  private formatMinutesToTime(minutes: number): string {
    const hours = Math.floor(minutes / 60);
    const mins = Math.round(minutes % 60);
    return `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}`;
  }

  private createDeliveryTimeChart(): void {
    const canvas = document.getElementById('deliveryTimeChart') as HTMLCanvasElement;
    if (!canvas) {
      console.warn('Chart canvas not found');
      return;
    }

    // Destroy existing chart if it exists
    if (this.deliveryTimeChart) {
      this.deliveryTimeChart.destroy();
    }

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const labels = this.dailyDeliveryData.map(d => d.displayDate);
    const circleKData = this.dailyDeliveryData.map(d => d.circleKAvgTime ? d.circleKAvgTime / 60 : null); // Convert to hours
    const starbucksData = this.dailyDeliveryData.map(d => d.starbucksAvgTime ? d.starbucksAvgTime / 60 : null); // Convert to hours

    const config: ChartConfiguration = {
      type: 'line' as ChartType,
      data: {
        labels: labels,
        datasets: [
          {
            label: 'Circle K Average Time',
            data: circleKData,
            borderColor: '#ff6b35',
            backgroundColor: 'rgba(255, 107, 53, 0.1)',
            borderWidth: 2,
            fill: false,
            tension: 0.1,
            pointBackgroundColor: '#ff6b35',
            pointBorderColor: '#ffffff',
            pointBorderWidth: 2,
            pointRadius: 4
          },
          {
            label: 'Starbucks Average Time',
            data: starbucksData,
            borderColor: '#00704a',
            backgroundColor: 'rgba(0, 112, 74, 0.1)',
            borderWidth: 2,
            fill: false,
            tension: 0.1,
            pointBackgroundColor: '#00704a',
            pointBorderColor: '#ffffff',
            pointBorderWidth: 2,
            pointRadius: 4
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          title: {
            display: true,
            text: 'Average Delivery Times Comparison',
            font: {
              size: 14,
              weight: 'bold'
            }
          },
          legend: {
            display: true,
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
                return value + 'h';
              }
            }
          },
          x: {
            title: {
              display: true,
              text: 'Date'
            }
          }
        },
        elements: {
          point: {
            hoverRadius: 6
          }
        }
      }
    };

    this.deliveryTimeChart = new Chart(ctx, config);
  }

  toggleDayExpansion(dayGroup: DayGroup): void {
    dayGroup.isExpanded = !dayGroup.isExpanded;
  }

  toggleDaySelection(dayGroup: DayGroup): void {
    if (this.isDayFullySelected(dayGroup)) {
      // Deselect all updates in this day
      dayGroup.selectedUpdates.clear();
    } else {
      // Select all updates in this day
      dayGroup.updates.forEach(update => {
        dayGroup.selectedUpdates.add(update.id);
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
    return dayGroup.updates.length > 0 && dayGroup.selectedUpdates.size === dayGroup.updates.length;
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
    if (selectedUpdates.length > 0) {
      this.exportMultipleUpdates(selectedUpdates);
    }
  }

  exportMultipleUpdates(updates: any[]): void {
    if (updates.length === 0) {
      console.warn('No updates selected for export');
      return;
    }

    const today = new Date().toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });

    // Ask user for export format
    const exportFormat = confirm('Click OK for PDF export, Cancel for Excel export');
    
    if (exportFormat) {
      this.generatePDF(updates, today);
    } else {
      this.generateExcel(updates, today);
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

  private extractRouteNumber(routeName: string): number {
    if (!routeName) return 999; // Put unknown routes at the end
    
    // Extract number from route name (e.g., "Route 1" -> 1, "R2" -> 2)
    const match = routeName.match(/\d+/);
    return match ? parseInt(match[0], 10) : 999;
  }

  viewUpdateDetails(update: any): void {
    this.selectedDriverUpdate = update;
    this.driverViewMode = 'detail';
  }

  backToDriverList(): void {
    this.selectedDriverUpdate = null;
    this.driverViewMode = 'list';
  }

  getStoreCount(update: any): number {
    if (!update.delivery_data) return 0;
    
    let totalStores = 0;
    update.delivery_data.forEach((delivery: any) => {
      if (delivery.stores && Array.isArray(delivery.stores)) {
        totalStores += delivery.stores.length;
      }
    });
    
    return totalStores;
  }

  getAllStoresFromDeliveries(): any[] {
    if (!this.selectedDriverUpdate?.delivery_data) return [];
    
    const allStores: any[] = [];
    this.selectedDriverUpdate.delivery_data.forEach((delivery: any, deliveryIndex: number) => {
      if (delivery.stores && Array.isArray(delivery.stores)) {
        delivery.stores.forEach((store: any, storeIndex: number) => {
          allStores.push({
            deliveryIndex,
            storeIndex,
            storeData: store
          });
        });
      }
    });
    
    return allStores;
  }

  toggleStoreSelection(deliveryIndex: number, storeIndex: number): void {
    const existingIndex = this.selectedStores.findIndex(
      s => s.deliveryIndex === deliveryIndex && s.storeIndex === storeIndex
    );
    
    if (existingIndex >= 0) {
      this.selectedStores.splice(existingIndex, 1);
    } else {
      const storeData = this.selectedDriverUpdate.delivery_data[deliveryIndex].stores[storeIndex];
      this.selectedStores.push({
        deliveryIndex,
        storeIndex,
        storeData
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
    // Implementation for exporting selected stores
    console.log('Exporting selected stores:', this.selectedStores);
  }

  exportFullUpdate(update: any): void {
    // Implementation for exporting full update
    console.log('Exporting full update:', update);
  }

  toggleAnalytics(): void {
    this.showAnalytics = !this.showAnalytics;
    
    // If showing analytics, create the chart after a short delay to ensure DOM is ready
    if (this.showAnalytics) {
      setTimeout(() => {
        this.createDeliveryTimeChart();
      }, 100);
    }
  }

  getOutstandingDeliveriesForDay(dayGroup: DayGroup): number {
    let total = 0;
    dayGroup.updates.forEach(update => {
      total += this.getStoreCount(update);
    });
    return total;
  }

  getAdvancedNotificationsForDay(dayGroup: DayGroup): number {
    return dayGroup.updates.filter(update => 
      update.comments && update.comments.trim().length > 0
    ).length;
  }

  // Date Range Export Methods
  setQuickRange(range: 'week' | 'month'): void {
    const today = new Date();
    const endDate = new Date(today);
    endDate.setHours(23, 59, 59, 999);
    
    let startDate = new Date(today);
    
    if (range === 'week') {
      startDate.setDate(startDate.getDate() - 7);
    } else if (range === 'month') {
      startDate.setMonth(startDate.getMonth() - 1);
    }
    
    startDate.setHours(0, 0, 0, 0);
    
    this.exportStartDate = startDate.toISOString().split('T')[0];
    this.exportEndDate = endDate.toISOString().split('T')[0];
  }

  async exportDateRange(): Promise<void> {
    if (!this.exportStartDate || !this.exportEndDate) {
      alert('Please select both start and end dates');
      return;
    }

    const startDate = new Date(this.exportStartDate);
    startDate.setHours(0, 0, 0, 0);
    
    const endDate = new Date(this.exportEndDate);
    endDate.setHours(23, 59, 59, 999);

    if (startDate > endDate) {
      alert('Start date must be before end date');
      return;
    }

    try {
      // Load updates for the selected date range
      const { data, error } = await this.supabaseService.getSupabase()
        .from('driver_delivery_updates')
        .select('*, drivers(name, custom_id)')
        .gte('created_at', startDate.toISOString())
        .lt('created_at', endDate.toISOString())
        .order('created_at', { ascending: false });

      if (error) throw error;

      const rangeUpdates = data || [];
      
      if (rangeUpdates.length === 0) {
        alert('No driver updates found for the selected date range');
        return;
      }

      // Export the updates for the selected range
      await this.exportUpdatesAsPDF(rangeUpdates, startDate, endDate);

    } catch (error) {
      console.error('Error exporting date range:', error);
      alert('Error exporting date range. Please try again.');
    }
  }

  private async exportUpdatesAsPDF(updates: any[], startDate: Date, endDate: Date): Promise<void> {
    try {
      const today = `${startDate.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
      })} - ${endDate.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
      })}`;

      // Ask user for export format
      const exportFormat = confirm('Click OK for PDF export, Cancel for Excel export');
      
      if (exportFormat) {
        this.generatePDF(updates, today);
      } else {
        this.generateExcel(updates, today);
      }

    } catch (error) {
      console.error('Error generating report:', error);
      alert('Error generating report. Please try again.');
    }
  }

  ngOnDestroy(): void {
    // Cleanup charts on component destruction
    if (this.deliveryTimeChart) {
      this.deliveryTimeChart.destroy();
    }
  }

  // Van Issues Methods
  async loadVanIssues(): Promise<void> {
    this.vanIssuesLoading = true;
    try {
      const { data, error } = await this.supabaseService.getSupabase()
        .from('van-issues')
        .select(`
          *,
          drivers (
            name,
            custom_id,
            phone_number,
            location
          )
        `)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error loading van issues:', error);
        return;
      }

      this.vanIssues = data?.map(issue => ({
        ...issue,
        driver_name: issue.drivers?.name || 'Unknown Driver',
        driver_custom_id: issue.drivers?.custom_id || '',
        driver_phone: issue.drivers?.phone_number || '',
        driver_location: issue.drivers?.location || ''
      })) || [];

    } catch (error) {
      console.error('Error loading van issues:', error);
    } finally {
      this.vanIssuesLoading = false;
    }
  }

  async verifyIssue(issueId: string): Promise<void> {
    const issue = this.vanIssues.find(i => i.id === issueId);
    if (!issue) return;
    
    // Show date picker modal
    this.selectedIssueForVerification = issue;
    this.fixedDate = new Date().toISOString().split('T')[0]; // Default to today
    this.showDateModal = true;
  }

  async confirmVerification(): Promise<void> {
    if (!this.selectedIssueForVerification || !this.fixedDate) return;
    
    const issueId = this.selectedIssueForVerification.id;
    this.isVerifying[issueId] = true;
    
    try {
      const verificationData = {
        verified: true,
        verified_at: new Date().toISOString(),
        verified_by: 'Admin',
        date_fixed: new Date(this.fixedDate).toISOString()
      };

      const { error } = await this.supabaseService.getSupabase()
        .from('van-issues')
        .update(verificationData)
        .eq('id', issueId);

      if (error) {
        console.error('Error verifying issue:', error);
        return;
      }

      // Update the local issue
      const issueIndex = this.vanIssues.findIndex(issue => issue.id === issueId);
      if (issueIndex !== -1) {
        this.vanIssues[issueIndex] = {
          ...this.vanIssues[issueIndex],
          ...verificationData
        };
      }

      // Update notification count
      this.notificationService.markVanIssueAsVerified();
      
      // Close modal
      this.closeDateModal();

    } catch (error) {
      console.error('Error verifying issue:', error);
    } finally {
      this.isVerifying[issueId] = false;
    }
  }

  closeDateModal(): void {
    this.showDateModal = false;
    this.selectedIssueForVerification = null;
    this.fixedDate = '';
  }

  async unverifyIssue(issueId: string): Promise<void> {
    this.isVerifying[issueId] = true;
    
    try {
      const verificationData = {
        verified: false,
        verified_at: undefined,
        verified_by: undefined,
        verification_notes: undefined
      };

      const { error } = await this.supabaseService.getSupabase()
        .from('van-issues')
        .update(verificationData)
        .eq('id', issueId);

      if (error) {
        console.error('Error unverifying issue:', error);
        return;
      }

      // Update the local issue
      const issueIndex = this.vanIssues.findIndex(issue => issue.id === issueId);
      if (issueIndex !== -1) {
        this.vanIssues[issueIndex] = {
          ...this.vanIssues[issueIndex],
          ...verificationData
        };
      }

      // Reload notifications to get updated count
      this.notificationService.loadNotifications();

    } catch (error) {
      console.error('Error unverifying issue:', error);
    } finally {
      this.isVerifying[issueId] = false;
    }
  }

  getImageUrl(imagePath: string): string {
    const { data } = this.supabaseService.getSupabase()
      .storage
      .from('van-issues')
      .getPublicUrl(imagePath);
    
    return data.publicUrl;
  }

  openVanIssueImageModal(imageUrl: string, issue: VanIssue): void {
    this.selectedImage = imageUrl;
    this.selectedIssue = issue;
  }

  closeVanIssueImageModal(): void {
    this.selectedImage = null;
    this.selectedIssue = null;
  }

  onImageError(event: Event): void {
    const target = event.target as HTMLImageElement;
    if (target) {
      target.style.display = 'none';
    }
  }

  trackByIssueId(index: number, issue: VanIssue): string {
    return issue.id;
  }

  trackByImagePath(index: number, imagePath: string): string {
    return imagePath;
  }

  getTodayDate(): string {
    return new Date().toISOString().split('T')[0];
  }

  // PDF Report Methods for Van Issues
  openVanIssuesReportModal(): void {
    this.showReportModal = true;
    this.initializeVanIssuesReportFilters();
  }

  closeVanIssuesReportModal(): void {
    this.showReportModal = false;
    this.resetVanIssuesReportFilters();
  }

  private initializeVanIssuesReportFilters(): void {
    // Set default date range to last 30 days
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 30);
    
    this.reportFilters.dateRange.start = startDate.toISOString().split('T')[0];
    this.reportFilters.dateRange.end = endDate.toISOString().split('T')[0];
    
    // Get unique vehicles from current issues
    this.availableVehicles = [...new Set(this.vanIssues.map(issue => issue.van_registration))].sort();
  }

  private resetVanIssuesReportFilters(): void {
    this.reportFilters = {
      status: 'all',
      dateRange: { start: '', end: '' },
      vehicles: []
    };
  }

  onVanIssuesVehicleSelectionChange(vehicle: string, event: any): void {
    if (event.target.checked) {
      if (!this.reportFilters.vehicles.includes(vehicle)) {
        this.reportFilters.vehicles.push(vehicle);
      }
    } else {
      this.reportFilters.vehicles = this.reportFilters.vehicles.filter(v => v !== vehicle);
    }
  }

  generateVanIssuesPdfReport(): void {
    this.isGeneratingReport = true;
    
    try {
      // Prepare filters for the PDF service
      const filters: any = {
        status: this.reportFilters.status
      };

      // Add date range if specified
      if (this.reportFilters.dateRange.start && this.reportFilters.dateRange.end) {
        filters.dateRange = {
          start: this.reportFilters.dateRange.start,
          end: this.reportFilters.dateRange.end
        };
      }

      // Add vehicle filter if any vehicles are selected
      if (this.reportFilters.vehicles.length > 0) {
        filters.vehicles = this.reportFilters.vehicles;
      }

      // Generate the report
      this.pdfReportService.generateFilteredReport(this.vanIssues, filters);
      
      // Close modal after successful generation
      this.closeVanIssuesReportModal();
      
    } catch (error) {
      console.error('Error generating PDF report:', error);
    } finally {
      this.isGeneratingReport = false;
    }
  }

  generateVanIssuesDetailedPdfReport(): void {
    this.isGeneratingReport = true;
    
    try {
      // Prepare filters for the PDF service
      const filters: any = {
        status: this.reportFilters.status
      };

      // Add date range if specified
      if (this.reportFilters.dateRange.start && this.reportFilters.dateRange.end) {
        filters.dateRange = {
          start: this.reportFilters.dateRange.start,
          end: this.reportFilters.dateRange.end
        };
      }

      // Add vehicle filter if any vehicles are selected
      if (this.reportFilters.vehicles.length > 0) {
        filters.vehicles = this.reportFilters.vehicles;
      }

      // Generate the detailed report
      this.pdfReportService.generateDetailedReport(this.vanIssues, filters);
      
      // Close modal after successful generation
      this.closeVanIssuesReportModal();
      
    } catch (error) {
      console.error('Error generating detailed PDF report:', error);
    } finally {
      this.isGeneratingReport = false;
    }
  }

  generateVanIssuesQuickReport(type: 'all' | 'verified' | 'pending'): void {
    this.isGeneratingReport = true;
    
    try {
      const filters = { status: type };
      this.pdfReportService.generateFilteredReport(this.vanIssues, filters);
    } catch (error) {
      console.error('Error generating quick report:', error);
    } finally {
      this.isGeneratingReport = false;
    }
  }

  getVanIssuesVerifiedCount(): number {
    return this.vanIssues.filter(issue => issue.verified).length;
  }

  getVanIssuesPendingCount(): number {
    return this.vanIssues.filter(issue => !issue.verified).length;
  }
}