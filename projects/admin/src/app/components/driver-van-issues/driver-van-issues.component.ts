import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { SupabaseService } from '../../services/supabase.service';
import { NotificationService } from '../../services/notification.service';

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

  constructor(
    private supabaseService: SupabaseService,
    private notificationService: NotificationService
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
} 