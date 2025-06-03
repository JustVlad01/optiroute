import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { SupabaseService } from '../../services/supabase.service';
import { Driver } from '../../services/models';

interface VanIssue {
  id?: string;
  driver_id: string;
  van_registration: string;
  driver_comments: string;
  image_urls?: string[];
  created_at?: string;
}

interface ImagePreview {
  file: File;
  url: string;
}

@Component({
  selector: 'app-report-van-issues',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './report-van-issues.component.html',
  styleUrls: ['./report-van-issues.component.scss']
})
export class ReportVanIssuesComponent implements OnInit, OnDestroy {
  driverData: Driver | null = null;
  vanRegNumber: string = '';
  issueDescriptions: string[] = [''];
  selectedImages: ImagePreview[] = [];
  isSubmitting: boolean = false;
  submitSuccess: boolean = false;
  submitError: string = '';
  showThankYou: boolean = false;
  
  constructor(
    private router: Router,
    private supabaseService: SupabaseService
  ) {}

  ngOnInit(): void {
    // Check if we have driver data from login
    const savedDriverData = localStorage.getItem('loggedInDriver');
    if (savedDriverData) {
      try {
        this.driverData = JSON.parse(savedDriverData) as Driver;
      } catch (e) {
        console.error('Error parsing saved driver data', e);
        this.router.navigate(['/login']);
      }
    } else {
      this.router.navigate(['/login']);
    }
  }

  addIssueDescription(): void {
    if (this.issueDescriptions.length < 10) { // Limit to 10 issues
      this.issueDescriptions.push('');
    }
  }

  removeIssueDescription(index: number): void {
    if (this.issueDescriptions.length > 1) {
      this.issueDescriptions.splice(index, 1);
    }
  }

  onImageSelect(event: any): void {
    const files = event.target.files;
    if (files) {
      // Clear previous selections
      this.selectedImages.forEach(img => URL.revokeObjectURL(img.url));
      this.selectedImages = [];
      
      // Convert FileList to Array and limit to 5 images
      const fileArray = Array.from(files).slice(0, 5) as File[];
      
      fileArray.forEach(file => {
        const imagePreview: ImagePreview = {
          file: file,
          url: URL.createObjectURL(file)
        };
        this.selectedImages.push(imagePreview);
      });
    }
  }

  removeImage(index: number): void {
    if (this.selectedImages[index]) {
      URL.revokeObjectURL(this.selectedImages[index].url);
      this.selectedImages.splice(index, 1);
    }
  }

  areIssuesValid(): boolean {
    return this.issueDescriptions.some(issue => issue.trim().length > 0);
  }

  trackByIndex(index: number, item: any): number {
    return index;
  }

  async submitIssue(): Promise<void> {
    if (!this.driverData || !this.vanRegNumber.trim() || !this.areIssuesValid()) {
      this.submitError = 'Please provide van registration number and at least one issue description.';
      return;
    }

    this.isSubmitting = true;
    this.submitError = '';
    this.submitSuccess = false;

    try {
      const imageUrls: string[] = [];

      // Upload images if any
      if (this.selectedImages.length > 0) {
        for (let i = 0; i < this.selectedImages.length; i++) {
          const imagePreview = this.selectedImages[i];
          const fileName = `${this.driverData.id}_${Date.now()}_${i}.${imagePreview.file.name.split('.').pop()}`;
          
          const { data, error } = await this.supabaseService.getSupabase()
            .storage
            .from('van-issues')
            .upload(fileName, imagePreview.file);

          if (error) {
            throw error;
          }

          if (data) {
            imageUrls.push(data.path);
          }
        }
      }

      // Combine all non-empty issue descriptions into a single comment with numbered sections
      const validIssues = this.issueDescriptions.filter(issue => issue.trim().length > 0);
      let combinedComment = '';
      
      if (validIssues.length === 1) {
        combinedComment = validIssues[0].trim();
      } else {
        combinedComment = validIssues
          .map((issue, index) => `Issue ${index + 1}: ${issue.trim()}`)
          .join('\n\n');
      }

      // Create the issue record
      const issueData: VanIssue = {
        driver_id: this.driverData.id,
        van_registration: this.vanRegNumber.trim().toUpperCase(),
        driver_comments: combinedComment,
        image_urls: imageUrls
      };

      const { error: insertError } = await this.supabaseService.getSupabase()
        .from('van-issues')
        .insert([issueData]);

      if (insertError) {
        throw insertError;
      }

      // Clean up object URLs
      this.selectedImages.forEach(img => URL.revokeObjectURL(img.url));
      
      // Reset form
      this.vanRegNumber = '';
      this.issueDescriptions = [''];
      this.selectedImages = [];
      
      // Show thank you message instead of just success
      this.showThankYou = true;

    } catch (error) {
      console.error('Error submitting van issue:', error);
      this.submitError = 'Failed to submit issue. Please try again.';
    } finally {
      this.isSubmitting = false;
    }
  }

  goBackToHome(): void {
    // Clean up object URLs before navigating away
    this.selectedImages.forEach(img => URL.revokeObjectURL(img.url));
    this.router.navigate(['/dashboard']);
  }

  ngOnDestroy(): void {
    // Clean up object URLs when component is destroyed
    this.selectedImages.forEach(img => URL.revokeObjectURL(img.url));
  }
} 