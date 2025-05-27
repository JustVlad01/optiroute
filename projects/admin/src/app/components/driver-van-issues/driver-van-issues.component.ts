import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { SupabaseService } from '../../services/supabase.service';
import { NotificationService } from '../../services/notification.service';
import { PdfReportService } from '../../services/pdf-report.service';

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
  selector: 'app-driver-van-issues',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './driver-van-issues.component.html',
  styleUrls: ['./driver-van-issues.component.scss']
})
export class DriverVanIssuesComponent implements OnInit {
  vanIssues: VanIssue[] = [];
  isLoading = true;
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
    private supabaseService: SupabaseService,
    private notificationService: NotificationService,
    private pdfReportService: PdfReportService
  ) {}

  ngOnInit(): void {
    this.loadVanIssues();
  }

  async loadVanIssues(): Promise<void> {
    this.isLoading = true;
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
      this.isLoading = false;
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

  openImageModal(imageUrl: string, issue: VanIssue): void {
    this.selectedImage = imageUrl;
    this.selectedIssue = issue;
  }

  closeImageModal(): void {
    this.selectedImage = null;
    this.selectedIssue = null;
  }

  onImageError(event: Event): void {
    const target = event.target as HTMLImageElement;
    if (target) {
      target.style.display = 'none';
    }
  }

  formatDate(dateString: string): string {
    return new Date(dateString).toLocaleString();
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

  // PDF Report Methods
  openReportModal(): void {
    this.showReportModal = true;
    this.initializeReportFilters();
  }

  closeReportModal(): void {
    this.showReportModal = false;
    this.resetReportFilters();
  }

  private initializeReportFilters(): void {
    // Set default date range to last 30 days
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 30);
    
    this.reportFilters.dateRange.start = startDate.toISOString().split('T')[0];
    this.reportFilters.dateRange.end = endDate.toISOString().split('T')[0];
    
    // Get unique vehicles from current issues
    this.availableVehicles = [...new Set(this.vanIssues.map(issue => issue.van_registration))].sort();
  }

  private resetReportFilters(): void {
    this.reportFilters = {
      status: 'all',
      dateRange: { start: '', end: '' },
      vehicles: []
    };
  }

  onVehicleSelectionChange(vehicle: string, event: any): void {
    if (event.target.checked) {
      if (!this.reportFilters.vehicles.includes(vehicle)) {
        this.reportFilters.vehicles.push(vehicle);
      }
    } else {
      this.reportFilters.vehicles = this.reportFilters.vehicles.filter(v => v !== vehicle);
    }
  }

  generatePdfReport(): void {
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
      this.closeReportModal();
      
    } catch (error) {
      console.error('Error generating PDF report:', error);
    } finally {
      this.isGeneratingReport = false;
    }
  }

  generateDetailedPdfReport(): void {
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
      this.closeReportModal();
      
    } catch (error) {
      console.error('Error generating detailed PDF report:', error);
    } finally {
      this.isGeneratingReport = false;
    }
  }

  generateQuickReport(type: 'all' | 'verified' | 'pending'): void {
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

  getVerifiedCount(): number {
    return this.vanIssues.filter(issue => issue.verified).length;
  }

  getPendingCount(): number {
    return this.vanIssues.filter(issue => !issue.verified).length;
  }
} 