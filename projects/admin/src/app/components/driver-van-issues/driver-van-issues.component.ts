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
  issue_completions?: { [key: number]: boolean };
  repair_receipt_urls?: string[];
}

interface ParsedIssue {
  index: number;
  description: string;
  completed: boolean;
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

  // Repair receipt upload properties
  showReceiptUploadModal = false;
  selectedIssueForReceipts: VanIssue | null = null;
  isUploadingReceipts = false;
  uploadProgress = 0;

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

  trackByIssueIndex(index: number, parsedIssue: ParsedIssue): number {
    return parsedIssue.index;
  }

  trackByImagePath(index: number, imagePath: string): string {
    return imagePath;
  }

  trackByReceiptPath(index: number, receiptPath: string): string {
    return receiptPath;
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

  parseIssuesFromComments(comments: string, issueCompletions?: { [key: number]: boolean }): ParsedIssue[] {
    if (!comments) return [];
    
    // Check if comments contain numbered issues (Issue 1:, Issue 2:, etc.)
    const numberedIssuePattern = /Issue (\d+):\s*(.+?)(?=Issue \d+:|$)/gs;
    const matches = [...comments.matchAll(numberedIssuePattern)];
    
    if (matches.length > 0) {
      // Multiple numbered issues found
      return matches.map((match, index) => ({
        index: parseInt(match[1]) - 1, // Convert to 0-based index
        description: match[2].trim(),
        completed: issueCompletions?.[parseInt(match[1]) - 1] || false
      }));
    } else {
      // Single issue
      return [{
        index: 0,
        description: comments.trim(),
        completed: issueCompletions?.[0] || false
      }];
    }
  }

  async toggleIssueCompletion(vanIssue: VanIssue, issueIndex: number): Promise<void> {
    const issueCompletions = { ...(vanIssue.issue_completions || {}) };
    issueCompletions[issueIndex] = !issueCompletions[issueIndex];

    try {
      const { error } = await this.supabaseService.getSupabase()
        .from('van-issues')
        .update({ issue_completions: issueCompletions })
        .eq('id', vanIssue.id);

      if (error) {
        console.error('Error updating issue completion:', error);
        return;
      }

      // Update local data
      const issueIndex = this.vanIssues.findIndex(i => i.id === vanIssue.id);
      if (issueIndex !== -1) {
        this.vanIssues[issueIndex].issue_completions = issueCompletions;
      }

      console.log('Issue completion updated successfully');
    } catch (error) {
      console.error('Error updating issue completion:', error);
    }
  }

  getCompletionProgress(vanIssue: VanIssue): { completed: number; total: number } {
    const issues = this.parseIssuesFromComments(vanIssue.driver_comments, vanIssue.issue_completions);
    const completed = issues.filter(issue => issue.completed).length;
    return { completed, total: issues.length };
  }

  isIssueFullyCompleted(vanIssue: VanIssue): boolean {
    const progress = this.getCompletionProgress(vanIssue);
    return progress.completed === progress.total && progress.total > 0;
  }

  // Repair Receipt Methods
  openReceiptUploadModal(issue: VanIssue): void {
    this.selectedIssueForReceipts = issue;
    this.showReceiptUploadModal = true;
  }

  closeReceiptUploadModal(): void {
    this.showReceiptUploadModal = false;
    this.selectedIssueForReceipts = null;
    this.uploadProgress = 0;
  }

  async onReceiptFilesSelected(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const files = input.files;
    
    if (!files || files.length === 0 || !this.selectedIssueForReceipts) {
      return;
    }

    this.isUploadingReceipts = true;
    this.uploadProgress = 0;

    try {
      const uploadedUrls: string[] = [];
      const totalFiles = files.length;

      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        
        // Validate file type (images only)
        if (!file.type.startsWith('image/')) {
          console.error(`File ${file.name} is not an image`);
          continue;
        }

        // Validate file size (max 5MB)
        if (file.size > 5 * 1024 * 1024) {
          console.error(`File ${file.name} is too large (max 5MB)`);
          continue;
        }

        // Generate unique filename
        const timestamp = new Date().getTime();
        const randomString = Math.random().toString(36).substring(2, 15);
        const fileExtension = file.name.split('.').pop();
        const fileName = `repair-receipts/${this.selectedIssueForReceipts.id}/${timestamp}-${randomString}.${fileExtension}`;

        // Upload to Supabase storage
        const { data, error } = await this.supabaseService.getSupabase()
          .storage
          .from('van-issues')
          .upload(fileName, file);

        if (error) {
          console.error('Error uploading receipt:', error);
          continue;
        }

        // Get public URL
        const { data: urlData } = this.supabaseService.getSupabase()
          .storage
          .from('van-issues')
          .getPublicUrl(data.path);

        uploadedUrls.push(data.path);
        
        // Update progress
        this.uploadProgress = Math.round(((i + 1) / totalFiles) * 100);
      }

      if (uploadedUrls.length > 0) {
        // Update database with new receipt URLs
        const currentReceipts = this.selectedIssueForReceipts.repair_receipt_urls || [];
        const updatedReceipts = [...currentReceipts, ...uploadedUrls];

        const { error } = await this.supabaseService.getSupabase()
          .from('van-issues')
          .update({ repair_receipt_urls: updatedReceipts })
          .eq('id', this.selectedIssueForReceipts.id);

        if (error) {
          console.error('Error updating database with receipt URLs:', error);
          return;
        }

        // Update local data
        const issueIndex = this.vanIssues.findIndex(issue => issue.id === this.selectedIssueForReceipts!.id);
        if (issueIndex !== -1) {
          this.vanIssues[issueIndex].repair_receipt_urls = updatedReceipts;
        }

        console.log('Repair receipts uploaded successfully');
        this.closeReceiptUploadModal();
      }

    } catch (error) {
      console.error('Error uploading repair receipts:', error);
    } finally {
      this.isUploadingReceipts = false;
      this.uploadProgress = 0;
      // Clear the input
      if (input) {
        input.value = '';
      }
    }
  }

  async deleteReceiptImage(issue: VanIssue, imagePath: string): Promise<void> {
    try {
      // Delete from storage
      const { error: storageError } = await this.supabaseService.getSupabase()
        .storage
        .from('van-issues')
        .remove([imagePath]);

      if (storageError) {
        console.error('Error deleting receipt from storage:', storageError);
        return;
      }

      // Update database
      const updatedReceipts = (issue.repair_receipt_urls || []).filter(url => url !== imagePath);
      
      const { error } = await this.supabaseService.getSupabase()
        .from('van-issues')
        .update({ repair_receipt_urls: updatedReceipts })
        .eq('id', issue.id);

      if (error) {
        console.error('Error updating database after receipt deletion:', error);
        return;
      }

      // Update local data
      const issueIndex = this.vanIssues.findIndex(i => i.id === issue.id);
      if (issueIndex !== -1) {
        this.vanIssues[issueIndex].repair_receipt_urls = updatedReceipts;
      }

      console.log('Repair receipt deleted successfully');

    } catch (error) {
      console.error('Error deleting repair receipt:', error);
    }
  }

  getReceiptImageUrl(imagePath: string): string {
    const { data } = this.supabaseService.getSupabase()
      .storage
      .from('van-issues')
      .getPublicUrl(imagePath);
    
    return data.publicUrl;
  }

  hasRepairReceipts(issue: VanIssue): boolean {
    return !!(issue.repair_receipt_urls && issue.repair_receipt_urls.length > 0);
  }
} 