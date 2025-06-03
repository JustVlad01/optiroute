import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
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
export class StaffRosterComponent implements OnInit, OnDestroy {
  rosters: StaffRoster[] = [];
  loading = false;
  selectedRoster: StaffRoster | null = null;
  errorMessage = '';

  // Touch and zoom functionality
  currentZoom = 1;
  currentRotation = 0;
  panX = 0;
  panY = 0;
  isFullscreen = false;
  
  // Touch gesture tracking
  private lastTouchDistance = 0;
  private lastTouchCenter = { x: 0, y: 0 };
  private isDragging = false;
  private lastPanPoint = { x: 0, y: 0 };

  constructor(
    private supabaseService: SupabaseService,
    private router: Router
  ) {}

  ngOnInit(): void {
    this.loadRosters();
    // Add keyboard event listeners
    document.addEventListener('keydown', this.onKeyDown.bind(this));
  }

  ngOnDestroy(): void {
    // Clean up event listeners
    document.removeEventListener('keydown', this.onKeyDown.bind(this));
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
    this.resetImageView();
  }

  closeViewer(): void {
    this.selectedRoster = null;
    this.resetImageView();
    if (this.isFullscreen) {
      this.exitFullscreen();
    }
  }

  goBack(): void {
    this.router.navigate(['/dashboard']);
  }

  // Image manipulation methods
  resetImageView(): void {
    this.currentZoom = 1;
    this.currentRotation = 0;
    this.panX = 0;
    this.panY = 0;
  }

  zoomIn(): void {
    this.currentZoom = Math.min(this.currentZoom * 1.2, 5);
  }

  zoomOut(): void {
    this.currentZoom = Math.max(this.currentZoom / 1.2, 0.1);
    // Reset pan if zoomed out too much
    if (this.currentZoom <= 1) {
      this.panX = 0;
      this.panY = 0;
    }
  }

  rotateLeft(): void {
    this.currentRotation -= 90;
  }

  rotateRight(): void {
    this.currentRotation += 90;
  }

  toggleFullscreen(): void {
    if (this.isFullscreen) {
      this.exitFullscreen();
    } else {
      this.enterFullscreen();
    }
  }

  private enterFullscreen(): void {
    const element = document.documentElement;
    if (element.requestFullscreen) {
      element.requestFullscreen();
    } else if ((element as any).webkitRequestFullscreen) {
      (element as any).webkitRequestFullscreen();
    } else if ((element as any).msRequestFullscreen) {
      (element as any).msRequestFullscreen();
    }
    this.isFullscreen = true;
  }

  private exitFullscreen(): void {
    if (document.exitFullscreen) {
      document.exitFullscreen();
    } else if ((document as any).webkitExitFullscreen) {
      (document as any).webkitExitFullscreen();
    } else if ((document as any).msExitFullscreen) {
      (document as any).msExitFullscreen();
    }
    this.isFullscreen = false;
  }

  // Touch event handlers
  onTouchStart(event: TouchEvent): void {
    event.preventDefault();
    
    if (event.touches.length === 1) {
      // Single touch - start dragging
      this.isDragging = true;
      this.lastPanPoint = {
        x: event.touches[0].clientX,
        y: event.touches[0].clientY
      };
    } else if (event.touches.length === 2) {
      // Two finger touch - prepare for pinch zoom
      this.isDragging = false;
      const touch1 = event.touches[0];
      const touch2 = event.touches[1];
      
      this.lastTouchDistance = Math.sqrt(
        Math.pow(touch2.clientX - touch1.clientX, 2) + 
        Math.pow(touch2.clientY - touch1.clientY, 2)
      );
      
      this.lastTouchCenter = {
        x: (touch1.clientX + touch2.clientX) / 2,
        y: (touch1.clientY + touch2.clientY) / 2
      };
    }
  }

  onTouchMove(event: TouchEvent): void {
    event.preventDefault();
    
    if (event.touches.length === 1 && this.isDragging && this.currentZoom > 1) {
      // Single touch drag - pan the image
      const deltaX = event.touches[0].clientX - this.lastPanPoint.x;
      const deltaY = event.touches[0].clientY - this.lastPanPoint.y;
      
      this.panX += deltaX;
      this.panY += deltaY;
      
      this.lastPanPoint = {
        x: event.touches[0].clientX,
        y: event.touches[0].clientY
      };
    } else if (event.touches.length === 2) {
      // Two finger pinch - zoom
      const touch1 = event.touches[0];
      const touch2 = event.touches[1];
      
      const currentDistance = Math.sqrt(
        Math.pow(touch2.clientX - touch1.clientX, 2) + 
        Math.pow(touch2.clientY - touch1.clientY, 2)
      );
      
      if (this.lastTouchDistance > 0) {
        const scale = currentDistance / this.lastTouchDistance;
        const newZoom = this.currentZoom * scale;
        this.currentZoom = Math.max(0.1, Math.min(5, newZoom));
      }
      
      this.lastTouchDistance = currentDistance;
    }
  }

  onTouchEnd(event: TouchEvent): void {
    event.preventDefault();
    
    if (event.touches.length === 0) {
      this.isDragging = false;
      this.lastTouchDistance = 0;
      
      // Reset pan if zoomed out
      if (this.currentZoom <= 1) {
        this.panX = 0;
        this.panY = 0;
        this.currentZoom = 1;
      }
    }
  }

  // Double tap to reset zoom
  onDoubleClick(): void {
    this.resetImageView();
  }

  // Keyboard controls
  private onKeyDown(event: KeyboardEvent): void {
    if (!this.selectedRoster) return;
    
    switch (event.key) {
      case 'Escape':
        this.closeViewer();
        break;
      case '+':
      case '=':
        event.preventDefault();
        this.zoomIn();
        break;
      case '-':
        event.preventDefault();
        this.zoomOut();
        break;
      case 'ArrowLeft':
        event.preventDefault();
        this.rotateLeft();
        break;
      case 'ArrowRight':
        event.preventDefault();
        this.rotateRight();
        break;
      case 'f':
      case 'F':
        event.preventDefault();
        this.toggleFullscreen();
        break;
    }
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