import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { SupabaseService } from '../../services/supabase.service';
import { Driver } from '../../models/driver.model';
import { FileObject } from '@supabase/storage-js';

// Define our own interface for performance images
interface PerformanceImage {
  name: string;
  url: string;
  created_at: string;
}

@Component({
  selector: 'app-driving-dashboard',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './driving-dashboard.component.html',
  styleUrls: ['./driving-dashboard.component.scss']
})
export class DrivingDashboardComponent implements OnInit, OnDestroy {
  driverData: Driver | null = null;
  performanceImages: PerformanceImage[] = [];
  isLoading = true;
  loadError: string | null = null;
  selectedImageIndex = 0;
  public isFullScreen: boolean = false;
  driverId: string | null = null;
  currentRotation: number = 0;
  zoomLevel: number = 1;
  isMaximized: boolean = false;
  
  constructor(private supabaseService: SupabaseService) { }

  async ngOnInit(): Promise<void> {
    this.isLoading = true;
    
    // Get driver info from localStorage
    const savedDriverData = localStorage.getItem('loggedInDriver');
    if (savedDriverData) {
      try {
        this.driverData = JSON.parse(savedDriverData) as Driver;
        if (this.driverData && this.driverData.id) {
          await this.loadPerformanceImages(this.driverData.id);
        }
      } catch (e) {
        console.error('Error parsing saved driver data', e);
        this.loadError = 'Error loading driver data';
      }
    }
    
    this.isLoading = false;
  }

  async loadPerformanceImages(driverId: string): Promise<void> {
    try {
      // Create the Supabase client
      const supabase = this.supabaseService.getClient();
      
      // List files for this driver
      const { data, error } = await supabase
        .storage
        .from('driver-performance')
        .list(`${driverId}`);
      
      if (error) {
        console.error('Error loading performance images:', error);
        this.performanceImages = [];
        this.loadError = 'Failed to load performance data';
        return;
      }

      if (!data || data.length === 0) {
        this.performanceImages = [];
        return;
      }

      // Generate URLs for the images
      this.performanceImages = await Promise.all(data.map(async (file: FileObject) => {
        const { data: urlData } = await supabase
          .storage
          .from('driver-performance')
          .createSignedUrl(`${driverId}/${file.name}`, 60 * 60 * 24); // 24 hour signed URL
        
        return {
          name: file.name,
          url: urlData?.signedUrl || '',
          created_at: file.created_at
        };
      }));

      // Sort by most recent first
      this.performanceImages.sort((a, b) => {
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      });
    } catch (error) {
      console.error('Exception loading performance images:', error);
      this.performanceImages = [];
      this.loadError = 'Failed to load performance data';
    }
  }

  rotateImage(): void {
    // Rotate 90 degrees clockwise each time
    this.currentRotation = (this.currentRotation + 90) % 360;
  }

  resetRotation(): void {
    this.currentRotation = 0;
  }

  zoomIn(): void {
    this.zoomLevel += 0.1;
    if (this.zoomLevel > 3) this.zoomLevel = 3; // Limit max zoom
  }

  zoomOut(): void {
    this.zoomLevel -= 0.1;
    if (this.zoomLevel < 0.5) this.zoomLevel = 0.5; // Limit min zoom
  }

  resetZoom(): void {
    this.zoomLevel = 1;
  }

  toggleMaximize(): void {
    if (this.isFullScreen) {
      this.isMaximized = !this.isMaximized;
      
      // Reset zoom when toggling maximized state
      if (this.isMaximized) {
        this.zoomLevel = 1.5; // Slightly zoomed in when maximized
      } else {
        this.zoomLevel = 1;
      }
    }
  }

  previousImage(): void {
    if (this.selectedImageIndex > 0) {
      this.selectedImageIndex--;
    } else {
      this.selectedImageIndex = this.performanceImages.length - 1;
    }
    this.resetRotation();
    this.resetZoom();
    this.isMaximized = false;
  }

  nextImage(): void {
    if (this.selectedImageIndex < this.performanceImages.length - 1) {
      this.selectedImageIndex++;
    } else {
      this.selectedImageIndex = 0;
    }
    this.resetRotation();
    this.resetZoom();
    this.isMaximized = false;
  }

  ngOnDestroy(): void {
    // Reset body overflow when component is destroyed, if it was set
    if (document.body.style.overflow === 'hidden') {
      document.body.style.overflow = 'auto';
    }
  }

  toggleFullScreen(): void {
    this.isFullScreen = !this.isFullScreen;
    if (this.isFullScreen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'auto';
      this.resetZoom();
      this.isMaximized = false;
    }
  }
} 