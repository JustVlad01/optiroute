import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterModule } from '@angular/router';
import { SupabaseService } from '../../services/supabase.service';

// Bootstrap types
declare var bootstrap: any;

// Define the Driver interface
interface Driver {
  id: number;
  name: string;
  custom_id: string;
  role: string;
  location: string;
  phone_number?: string;
}

// Define the StaffRoster interface
interface StaffRoster {
  id: number;
  title: string;
  description?: string;
  image_url: string;
  file_name: string;
  file_size?: number;
  created_at: string;
  updated_at: string;
}

@Component({
  selector: 'app-roster',
  standalone: true,
  imports: [CommonModule, RouterModule, FormsModule],
  templateUrl: './roster.component.html',
  styleUrls: ['./roster.component.scss']
})
export class RosterComponent implements OnInit {
  // Tab management
  activeTab: string = 'staff-list';
  
  // Staff list properties
  drivers: Driver[] = [];
  loading = true;
  message = '';
  isError = false;
  selectedDriver: Driver | null = null;
  showModal = false;
  
  // Reset password properties
  selectedDriverForPasswordReset: Driver | null = null;
  showPasswordResetModal = false;
  resettingPassword = false;
  
  // Roster images properties
  selectedFile: File | null = null;
  isDragOver = false;
  uploading = false;
  rosterTitle = '';
  rosterDescription = '';
  rosters: StaffRoster[] = [];
  loadingRosters = false;
  selectedRoster: StaffRoster | null = null;
  rosterToDelete: StaffRoster | null = null;
  deleting = false;
  alertMessage = {
    show: false,
    type: 'success' as 'success' | 'error',
    text: ''
  };
  
  constructor(
    private supabaseService: SupabaseService,
    private router: Router
  ) {}

  ngOnInit(): void {
    this.loadDrivers();
    this.loadRosters();
  }

  // Tab management methods
  setActiveTab(tab: string): void {
    this.activeTab = tab;
  }

  async loadDrivers(): Promise<void> {
    this.loading = true;
    try {
      const data = await this.supabaseService.getAllDrivers();
      if (data) {
        this.drivers = data as Driver[];
      } else {
        this.drivers = [];
        this.message = 'Failed to load drivers.';
        this.isError = true;
      }
    } catch (error) {
      console.error('Error loading drivers:', error);
      this.message = 'An unexpected error occurred while loading drivers.';
      this.isError = true;
      this.drivers = [];
    } finally {
      this.loading = false;
    }
  }

  navigateToRegister(): void {
    this.router.navigate(['/register']);
  }

  confirmDelete(driver: Driver): void {
    this.selectedDriver = driver;
    this.showModal = true;
  }

  closeModal(): void {
    this.showModal = false;
    this.selectedDriver = null;
  }

  async deleteDriver(): Promise<void> {
    if (!this.selectedDriver) return;
    
    try {
      const success = await this.supabaseService.deleteDriver(this.selectedDriver.id);
      
      // Close the modal
      this.closeModal();
      
      if (success) {
        this.message = `Driver ${this.selectedDriver.name} deleted successfully.`;
        this.isError = false;
        // Reload the drivers list
        this.loadDrivers();
      } else {
        this.message = 'Failed to delete driver.';
        this.isError = true;
      }
    } catch (error) {
      console.error('Error deleting driver:', error);
      this.message = 'An unexpected error occurred during deletion.';
      this.isError = true;
    } finally {
      this.selectedDriver = null;
    }
  }

  getInitials(name: string): string {
    if (!name) return '';
    
    const words = name.trim().split(' ');
    if (words.length === 1) {
      return words[0].charAt(0).toUpperCase();
    }
    
    return (words[0].charAt(0) + words[words.length - 1].charAt(0)).toUpperCase();
  }

  async loadRosters(): Promise<void> {
    this.loadingRosters = true;

    try {
      const result = await this.supabaseService.getStaffRosters();
      
      if (result.success && result.data) {
        this.rosters = result.data;
      } else {
        this.showAlert('error', 'Failed to load staff rosters');
      }
    } catch (error) {
      console.error('Load rosters error:', error);
      this.showAlert('error', 'Failed to load staff rosters');
    } finally {
      this.loadingRosters = false;
    }
  }

  // File handling methods
  onDragOver(event: DragEvent): void {
    event.preventDefault();
    this.isDragOver = true;
  }

  onDragLeave(event: DragEvent): void {
    event.preventDefault();
    this.isDragOver = false;
  }

  onDrop(event: DragEvent): void {
    event.preventDefault();
    this.isDragOver = false;
    
    const files = event.dataTransfer?.files;
    if (files && files.length > 0) {
      this.handleFileSelection(files[0]);
    }
  }

  onFileSelected(event: any): void {
    const file = event.target.files[0];
    if (file) {
      this.handleFileSelection(file);
    }
  }

  private handleFileSelection(file: File): void {
    // Validate file type
    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'application/pdf'];
    if (!allowedTypes.includes(file.type)) {
      this.showAlert('error', 'Please select a valid image file (JPG, PNG) or PDF.');
      return;
    }

    // Validate file size (max 10MB)
    const maxSize = 10 * 1024 * 1024; // 10MB
    if (file.size > maxSize) {
      this.showAlert('error', 'File size must be less than 10MB.');
      return;
    }

    this.selectedFile = file;
    this.rosterTitle = this.generateDefaultTitle();
  }

  removeFile(event: Event): void {
    event.stopPropagation();
    this.selectedFile = null;
    this.rosterTitle = '';
    this.rosterDescription = '';
  }

  cancelUpload(): void {
    this.selectedFile = null;
    this.rosterTitle = '';
    this.rosterDescription = '';
  }

  private generateDefaultTitle(): string {
    const now = new Date();
    const weekNumber = this.getWeekNumber(now);
    return `Staff Roster - Week ${weekNumber} ${now.getFullYear()}`;
  }

  private getWeekNumber(date: Date): number {
    const firstDayOfYear = new Date(date.getFullYear(), 0, 1);
    const pastDaysOfYear = (date.getTime() - firstDayOfYear.getTime()) / 86400000;
    return Math.ceil((pastDaysOfYear + firstDayOfYear.getDay() + 1) / 7);
  }

  // Upload methods
  async uploadRoster(): Promise<void> {
    if (!this.selectedFile || !this.rosterTitle.trim()) {
      return;
    }

    this.uploading = true;

    try {
      // Generate unique filename
      const fileExtension = this.selectedFile.name.split('.').pop();
      const fileName = `staff-roster-${Date.now()}.${fileExtension}`;

      // Upload to Supabase storage
      const uploadResult = await this.supabaseService.uploadFile(
        'staff-roster',
        fileName,
        this.selectedFile
      );

      if (!uploadResult.success) {
        throw new Error(uploadResult.error || 'Failed to upload file');
      }

      // Get public URL
      const publicUrl = this.supabaseService.getPublicUrl('staff-roster', fileName);

      // Save roster data to database
      const rosterData = {
        title: this.rosterTitle.trim(),
        description: this.rosterDescription.trim() || null,
        image_url: publicUrl,
        file_name: fileName,
        file_size: this.selectedFile.size
      };

      const saveResult = await this.supabaseService.saveStaffRoster(rosterData);

      if (!saveResult.success) {
        // If database save fails, try to delete the uploaded file
        await this.supabaseService.deleteFile('staff-roster', fileName);
        throw new Error(saveResult.error || 'Failed to save roster data');
      }

      this.showAlert('success', 'Staff roster uploaded successfully!');
      this.cancelUpload();
      this.loadRosters();

    } catch (error) {
      console.error('Upload error:', error);
      this.showAlert('error', error instanceof Error ? error.message : 'Failed to upload roster');
    } finally {
      this.uploading = false;
    }
  }

  // Roster management methods
  viewRoster(roster: StaffRoster): void {
    this.selectedRoster = roster;
  }

  closeViewer(): void {
    this.selectedRoster = null;
  }

  confirmRosterDelete(roster: StaffRoster): void {
    this.rosterToDelete = roster;
  }

  cancelDelete(): void {
    this.rosterToDelete = null;
  }

  async deleteRoster(): Promise<void> {
    if (!this.rosterToDelete) return;

    this.deleting = true;

    try {
      // Delete from database
      const deleteResult = await this.supabaseService.deleteStaffRoster(this.rosterToDelete.id);
      
      if (!deleteResult.success) {
        throw new Error(deleteResult.error || 'Failed to delete roster');
      }

      // Delete file from storage
      await this.supabaseService.deleteFile('staff-roster', this.rosterToDelete.file_name);

      this.showAlert('success', 'Staff roster deleted successfully!');
      this.cancelDelete();
      this.loadRosters();

    } catch (error) {
      console.error('Delete error:', error);
      this.showAlert('error', error instanceof Error ? error.message : 'Failed to delete roster');
    } finally {
      this.deleting = false;
    }
  }

  // Utility methods
  formatFileSize(bytes: number): string {
    if (bytes === 0) return '0 Bytes';
    
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  formatDate(dateString: string): string {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  onImageError(event: any): void {
    event.target.src = 'assets/images/placeholder-image.png';
  }

  private showAlert(type: 'success' | 'error', text: string): void {
    this.alertMessage = { show: true, type, text };
    
    // Auto-hide after 5 seconds
    setTimeout(() => {
      this.alertMessage.show = false;
    }, 5000);
  }

  confirmPasswordReset(driver: Driver): void {
    this.selectedDriverForPasswordReset = driver;
    this.showPasswordResetModal = true;
  }

  closePasswordResetModal(): void {
    this.showPasswordResetModal = false;
    this.selectedDriverForPasswordReset = null;
  }

  async resetDriverPassword(): Promise<void> {
    if (!this.selectedDriverForPasswordReset) return;
    
    this.resettingPassword = true;
    
    // Store the driver name before closing the modal
    const driverName = this.selectedDriverForPasswordReset.name;
    
    try {
      const success = await this.supabaseService.resetDriverPassword(this.selectedDriverForPasswordReset.id);
      
      // Close the modal
      this.closePasswordResetModal();
      
      if (success) {
        this.message = `Password reset successfully for ${driverName}. They will need to create a new password on their next login.`;
        this.isError = false;
      } else {
        this.message = 'Failed to reset password.';
        this.isError = true;
      }
    } catch (error) {
      console.error('Error resetting driver password:', error);
      this.message = 'An unexpected error occurred during password reset.';
      this.isError = true;
    } finally {
      this.selectedDriverForPasswordReset = null;
      this.resettingPassword = false;
    }
  }
} 