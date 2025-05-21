import { Component, OnInit, ViewChild, ElementRef, Renderer2, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { SupabaseService } from '../../services/supabase.service';

@Component({
  selector: 'app-driver-performance',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './driver-performance.component.html',
  styleUrls: ['./driver-performance.component.scss']
})
export class DriverPerformanceComponent implements OnInit {
  driverId: string = '';
  driverName: string = '';
  performanceImages: any[] = [];
  isLoading = true;
  selectedImage: any = null;
  isFullscreen = false;
  
  // Properties for image transformation
  currentRotation = 0;
  currentZoom = 1;
  zoomStep = 0.1;
  maxZoom = 3;
  minZoom = 0.5;

  @ViewChild('imageElement') imageElement!: ElementRef;

  constructor(
    private router: Router,
    private supabaseService: SupabaseService,
    private renderer: Renderer2
  ) {}

  // Listen for Esc key to exit fullscreen and close modal
  @HostListener('document:keydown.escape', ['$event'])
  onKeydownHandler(event: KeyboardEvent) {
    if (this.selectedImage) {
      this.closeImage();
    }
  }

  async ngOnInit(): Promise<void> {
    console.log('=== Driver Performance Component Initializing ===');
    this.isLoading = true;
    
    try {
      // Get driver info from localStorage
      const loggedInDriverStr = localStorage.getItem('loggedInDriver');
      console.log('Logged in driver data:', loggedInDriverStr);
      
      if (loggedInDriverStr) {
        try {
          const driver = JSON.parse(loggedInDriverStr);
          this.driverId = driver.id;
          this.driverName = driver.name;
          console.log('Driver ID:', this.driverId);
          console.log('Driver Name:', this.driverName);
          
          await this.loadPerformanceImages();
        } catch (e) {
          console.error('Error parsing logged in driver data', e);
          alert('Error loading driver data. Please try logging in again.');
          this.router.navigate(['/login']);
        }
      } else {
        console.log('No logged in driver found, redirecting to login');
        this.router.navigate(['/login']);
      }
    } catch (error) {
      console.error('Error initializing driver performance component:', error);
      this.isLoading = false;
    }
  }

  async loadPerformanceImages(): Promise<void> {
    console.log('=== loadPerformanceImages started ===');
    this.isLoading = true;
    
    if (!this.driverId) {
      console.error('No driver ID available');
      this.isLoading = false;
      return;
    }

    console.log('Loading performance images for driver:', this.driverId);

    try {
      // Mock some test data if in development mode
      if (this.driverId === 'test' || this.driverId === 'demo') {
        console.log('Using mock performance data for test/demo driver');
        this.performanceImages = [
          {
            name: 'test_image_1.jpg',
            url: 'https://via.placeholder.com/800x600/007bff/ffffff?text=Performance+Data',
            created_at: new Date().toISOString()
          },
          {
            name: 'test_image_2.jpg',
            url: 'https://via.placeholder.com/800x600/28a745/ffffff?text=Driver+Stats',
            created_at: new Date(Date.now() - 86400000).toISOString() // 1 day ago
          }
        ];
        this.isLoading = false;
        console.log('Mock performance images loaded:', this.performanceImages.length);
        return;
      }

      // Check if Supabase service is available
      const supabase = this.supabaseService.getSupabase();
      if (!supabase) {
        console.error('Supabase client not available');
        alert('Error: Storage service not available');
        this.isLoading = false;
        return;
      }

      // List files for this driver from the 'driver-performance' bucket
      console.log('Listing files from driver-performance/' + this.driverId);
      const { data, error } = await supabase
        .storage
        .from('driver-performance')
        .list(`${this.driverId}`);
      
      if (error) {
        console.error('Error loading performance images:', error);
        this.performanceImages = [];
        this.isLoading = false;
        return;
      }

      console.log('Found performance image files:', data);
      
      if (!data || data.length === 0) {
        console.log('No performance images found for driver');
        this.performanceImages = [];
        this.isLoading = false;
        return;
      }

      // Generate URLs for the images
      this.performanceImages = await Promise.all((data || []).map(async (file: any) => {
        console.log('Processing file:', file.name);
        if (file.name === '.keep') return null; // Skip the .keep file
        
        const { data: urlData, error: urlError } = await supabase
          .storage
          .from('driver-performance')
          .createSignedUrl(`${this.driverId}/${file.name}`, 60 * 60 * 24); // 24 hour signed URL
        
        if (urlError) {
          console.error('Error creating signed URL for file:', file.name, urlError);
          return null;
        }
        
        if (!urlData || !urlData.signedUrl) {
          console.error('No signed URL created for:', file.name);
          return null;
        }
        
        console.log('Created signed URL for:', file.name);
        return {
          name: file.name,
          url: urlData.signedUrl,
          created_at: file.created_at || new Date().toISOString()
        };
      }));

      // Filter out any null results from failed URL creation
      this.performanceImages = this.performanceImages.filter(img => img !== null);
      
      // Sort by most recent first
      this.performanceImages.sort((a, b) => {
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      });
      
      console.log('Loaded performance images:', this.performanceImages.length);
    } catch (error) {
      console.error('Exception loading performance images:', error);
      this.performanceImages = [];
    } finally {
      this.isLoading = false;
      console.log('=== loadPerformanceImages completed ===');
    }
  }

  openImage(image: any): void {
    console.log('Opening performance image:', image.name);
    this.selectedImage = image;
    this.isFullscreen = false;
    this.currentRotation = 0; // Reset rotation
    this.currentZoom = 1;     // Reset zoom
  }

  closeImage(): void {
    // Exit fullscreen if needed before closing
    if (this.isFullscreen) {
      this.exitFullscreen();
    }
    this.selectedImage = null;
  }

  // Image transformation methods
  rotateLeft(): void {
    this.currentRotation -= 90;
  }

  rotateRight(): void {
    this.currentRotation += 90;
  }

  zoomIn(): void {
    this.currentZoom = Math.min(this.maxZoom, this.currentZoom + this.zoomStep);
  }

  zoomOut(): void {
    this.currentZoom = Math.max(this.minZoom, this.currentZoom - this.zoomStep);
  }

  toggleFullscreen(): void {
    if (this.isFullscreen) {
      this.exitFullscreen();
    } else {
      this.enterFullscreen();
    }
  }

  enterFullscreen(): void {
    // Find the modal overlay element
    const modalElement = document.querySelector('.modal-overlay');
    if (modalElement) {
      this.renderer.addClass(modalElement, 'fullscreen');
      
      // Try to request fullscreen on the element
      if (modalElement.requestFullscreen) {
        modalElement.requestFullscreen();
      } else if ((modalElement as any).mozRequestFullScreen) { /* Firefox */
        (modalElement as any).mozRequestFullScreen();
      } else if ((modalElement as any).webkitRequestFullscreen) { /* Chrome, Safari & Opera */
        (modalElement as any).webkitRequestFullscreen();
      } else if ((modalElement as any).msRequestFullscreen) { /* IE/Edge */
        (modalElement as any).msRequestFullscreen();
      }
      
      this.isFullscreen = true;
    }
  }

  exitFullscreen(): void {
    // Find the modal overlay element and remove fullscreen class
    const modalElement = document.querySelector('.modal-overlay');
    if (modalElement) {
      this.renderer.removeClass(modalElement, 'fullscreen');
    }
    
    // Exit browser fullscreen mode
    if (document.exitFullscreen) {
      document.exitFullscreen();
    } else if ((document as any).mozCancelFullScreen) { /* Firefox */
      (document as any).mozCancelFullScreen();
    } else if ((document as any).webkitExitFullscreen) { /* Chrome, Safari & Opera */
      (document as any).webkitExitFullscreen();
    } else if ((document as any).msExitFullscreen) { /* IE/Edge */
      (document as any).msExitFullscreen();
    }
    
    this.isFullscreen = false;
  }

  goBack(): void {
    console.log('Navigating back to dashboard');
    this.router.navigate(['/dashboard']);
  }
}
