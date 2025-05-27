import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { SupabaseService } from '../../services/supabase.service';

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
  selector: 'app-staff-roster',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './staff-roster.component.html',
  styleUrls: ['./staff-roster.component.scss']
})
export class StaffRosterComponent implements OnInit {
  rosters: StaffRoster[] = [];
  loading = false;
  selectedRoster: StaffRoster | null = null;
  errorMessage = '';

  constructor(private supabaseService: SupabaseService) {}

  ngOnInit(): void {
    this.loadRosters();
  }

  async loadRosters(): Promise<void> {
    this.loading = true;
    this.errorMessage = '';

    try {
      const result = await this.supabaseService.getStaffRosters();
      
      if (result.success && result.data) {
        this.rosters = result.data;
      } else {
        this.errorMessage = 'Failed to load staff rosters. Please try again later.';
      }
    } catch (error) {
      console.error('Load rosters error:', error);
      this.errorMessage = 'Failed to load staff rosters. Please try again later.';
    } finally {
      this.loading = false;
    }
  }

  viewRoster(roster: StaffRoster): void {
    this.selectedRoster = roster;
  }

  closeViewer(): void {
    this.selectedRoster = null;
  }

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
      day: 'numeric'
    });
  }

  onImageError(event: any): void {
    event.target.src = 'assets/images/placeholder-image.png';
  }
} 