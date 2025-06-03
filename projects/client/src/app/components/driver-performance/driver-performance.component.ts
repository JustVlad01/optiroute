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
  standaloneComments: any[] = [];
  isLoading = true;
  selectedImage: any = null;
  isFullscreen = false;
  
  // Properties for image transformation
  currentRotation = 0;
  currentZoom = 1;
  zoomStep = 0.1;
  maxZoom = 3;
  minZoom = 0.5;

  // Properties for touch gestures
  panX = 0;
  panY = 0;
  private lastPanX = 0;
  private lastPanY = 0;
  private initialDistance = 0;
  private lastTouchDistance = 0;
  private isPanning = false;
  private isZooming = false;
  private touchStartX = 0;
  private touchStartY = 0;
  private lastTapTime = 0;
  private readonly doubleTapDelay = 300; // milliseconds

  // Properties for grouping by date
  groupedPerformanceData: any[] = [];
  expandedDays: { [key: string]: boolean } = {};

  @ViewChild('imageElement') imageElement!: ElementRef;

  constructor(
    private router: Router,
    private supabaseService: SupabaseService,
    private renderer: Renderer2
  ) {}

  // Listen for keyboard events to enhance image viewing experience
  @HostListener('document:keydown.escape', ['$event'])
  @HostListener('document:keydown', ['$event'])
  onKeydownHandler(event: KeyboardEvent) {
    if (this.selectedImage) {
      switch(event.key) {
        case 'Escape':
          this.closeImage();
          break;
        case 'ArrowLeft':
          event.preventDefault();
          this.rotateLeft();
          break;
        case 'ArrowRight':
          event.preventDefault();
          this.rotateRight();
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
        case 'f':
        case 'F':
          event.preventDefault();
          this.toggleFullscreen();
          break;
      }
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
          
          // Mark performance as viewed (clear notifications)
          this.markPerformanceAsViewed();
          
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

  markPerformanceAsViewed(): void {
    if (!this.driverId) return;
    
    // Keep localStorage for backward compatibility
    const lastViewedKey = `performance_last_viewed_${this.driverId}`;
    localStorage.setItem(lastViewedKey, new Date().toISOString());
    console.log('Performance marked as viewed for driver:', this.driverId);
    
    // Also record in database for admin tracking
    this.recordPerformanceView();
  }

  async recordPerformanceView(): Promise<void> {
    if (!this.driverId) return;
    
    try {
      const supabase = this.supabaseService.getSupabase();
      if (!supabase) {
        console.error('Supabase client not available');
        return;
      }

      // First check if a record exists for this driver
      const { data: existingRecord } = await supabase
        .from('driver_performance_views')
        .select('*')
        .eq('driver_id', this.driverId)
        .limit(1);

      const currentTime = new Date().toISOString();

      if (existingRecord && existingRecord.length > 0) {
        // Update existing record
        const { error } = await supabase
          .from('driver_performance_views')
          .update({ 
            viewed_at: currentTime,
            updated_at: currentTime 
          })
          .eq('driver_id', this.driverId);

        if (error) {
          console.error('Error updating performance view:', error);
        } else {
          console.log('Performance view updated successfully for driver:', this.driverId, 'at:', currentTime);
        }
      } else {
        // Insert new record
        const { error } = await supabase
          .from('driver_performance_views')
          .insert({
            driver_id: this.driverId,
            viewed_at: currentTime,
            created_at: currentTime,
            updated_at: currentTime
          });

        if (error) {
          console.error('Error inserting performance view:', error);
        } else {
          console.log('Performance view recorded successfully for driver:', this.driverId, 'at:', currentTime);
        }
      }
    } catch (error) {
      console.error('Exception recording performance view:', error);
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
        
        // Load comments for this image
        const { data: commentsData } = await supabase
          .from('driver_performance_comments')
          .select('*')
          .eq('driver_id', this.driverId)
          .eq('image_name', file.name)
          .order('created_at', { ascending: false })
          .limit(1);
        
        console.log('Created signed URL for:', file.name);
        return {
          name: file.name,
          url: urlData.signedUrl,
          created_at: file.created_at || new Date().toISOString(),
          comments: commentsData && commentsData.length > 0 ? commentsData[0].comments : null,
          comment_created_by: commentsData && commentsData.length > 0 ? commentsData[0].created_by : null
        };
      }));

      // Filter out any null results from failed URL creation
      this.performanceImages = this.performanceImages.filter(img => img !== null);
      
      // Sort by most recent first
      this.performanceImages.sort((a, b) => {
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      });
      
      // Load standalone comments (comments without corresponding image files)
      await this.loadStandaloneComments(supabase);
      
      console.log('Loaded performance images:', this.performanceImages.length);
      console.log('Loaded standalone comments:', this.standaloneComments.length);
      
      // Group performance data by date after loading
      this.groupPerformanceDataByDate();
    } catch (error) {
      console.error('Exception loading performance images:', error);
      this.performanceImages = [];
    } finally {
      this.isLoading = false;
      console.log('=== loadPerformanceImages completed ===');
    }
  }

  openImage(image: any): void {
    console.log('Opening performance image for height-optimized display:', image.name);
    this.selectedImage = image;
    this.isFullscreen = false;
    this.currentRotation = 0; // Reset rotation
    this.currentZoom = 1;     // Reset zoom
    this.resetImageTransform(); // Reset pan values
    
    // Focus on the modal to enable keyboard navigation
    setTimeout(() => {
      const modal = document.querySelector('.modal-overlay');
      if (modal && modal instanceof HTMLElement) {
        modal.focus();
      }
    }, 100);
  }

  openImageInFullscreen(item: any): void {
    console.log('Opening performance image directly in fullscreen:', item.name);
    this.selectedImage = item;
    this.currentRotation = 0; // Reset rotation
    this.currentZoom = 1;     // Reset zoom
    this.resetImageTransform(); // Reset pan values
    
    // Set fullscreen immediately
    setTimeout(() => {
      this.enterFullscreen();
      // Focus on the modal to enable keyboard navigation
      const modal = document.querySelector('.modal-overlay');
      if (modal && modal instanceof HTMLElement) {
        modal.focus();
      }
    }, 100);
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
    this.updateImageTransform();
  }

  rotateRight(): void {
    this.currentRotation += 90;
    this.updateImageTransform();
  }

  zoomIn(): void {
    this.currentZoom = Math.min(this.maxZoom, this.currentZoom + this.zoomStep);
    this.updateImageTransform();
  }

  zoomOut(): void {
    this.currentZoom = Math.max(this.minZoom, this.currentZoom - this.zoomStep);
    this.updateImageTransform();
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

  async loadStandaloneComments(supabase: any): Promise<void> {
    try {
      // Load only the most recent comment that doesn't correspond to actual image files
      // These are general comments saved from the admin panel
      const { data: commentsData, error } = await supabase
        .from('driver_performance_comments')
        .select('*')
        .eq('driver_id', this.driverId)
        .like('image_path', 'general_comment_%')
        .order('created_at', { ascending: false })
        .limit(1);
      
      if (error) {
        console.error('Error loading standalone comments:', error);
        this.standaloneComments = [];
        return;
      }
      
      this.standaloneComments = commentsData || [];
      console.log('Loaded newest standalone comment:', this.standaloneComments);
    } catch (error) {
      console.error('Exception loading standalone comments:', error);
      this.standaloneComments = [];
    }
  }

  goBack(): void {
    console.log('Navigating back to dashboard');
    this.router.navigate(['/dashboard']);
  }

  groupPerformanceDataByDate(): void {
    // Combine images and standalone comments
    const allItems = [
      ...this.performanceImages.map(img => ({ ...img, type: 'image' })),
      ...this.standaloneComments.map(comment => ({ 
        ...comment, 
        type: 'comment',
        created_at: comment.created_at,
        name: comment.image_name || 'General Comment'
      }))
    ];

    // Group by date
    const grouped = allItems.reduce((groups: any, item: any) => {
      const date = new Date(item.created_at);
      const dateKey = date.toDateString(); // e.g., "Mon Jan 20 2025"
      
      if (!groups[dateKey]) {
        groups[dateKey] = {
          date: dateKey,
          displayDate: this.formatDisplayDate(date),
          items: [],
          isExpanded: false
        };
      }
      
      groups[dateKey].items.push(item);
      return groups;
    }, {});

    // Convert to array and sort by date (most recent first)
    this.groupedPerformanceData = Object.values(grouped).sort((a: any, b: any) => {
      return new Date(b.date).getTime() - new Date(a.date).getTime();
    });

    // Auto-expand the most recent day
    if (this.groupedPerformanceData.length > 0) {
      this.groupedPerformanceData[0].isExpanded = true;
    }

    console.log('Grouped performance data:', this.groupedPerformanceData);
  }

  formatDisplayDate(date: Date): string {
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(today.getDate() - 1);
    
    if (date.toDateString() === today.toDateString()) {
      return 'Today';
    } else if (date.toDateString() === yesterday.toDateString()) {
      return 'Yesterday';
    } else {
      return date.toLocaleDateString('en-US', { 
        weekday: 'long', 
        year: 'numeric', 
        month: 'long', 
        day: 'numeric' 
      });
    }
  }

  toggleDayExpansion(dayGroup: any): void {
    dayGroup.isExpanded = !dayGroup.isExpanded;
  }

  // Touch gesture methods
  onTouchStart(event: TouchEvent): void {
    event.preventDefault();
    
    if (event.touches.length === 1) {
      // Single touch - start panning
      this.isPanning = true;
      this.touchStartX = event.touches[0].clientX;
      this.touchStartY = event.touches[0].clientY;
      this.lastPanX = this.panX;
      this.lastPanY = this.panY;
    } else if (event.touches.length === 2) {
      // Two fingers - start zooming
      this.isZooming = true;
      this.isPanning = false;
      
      const touch1 = event.touches[0];
      const touch2 = event.touches[1];
      this.initialDistance = this.getTouchDistance(touch1, touch2);
      this.lastTouchDistance = this.initialDistance;
    }
  }

  onTouchMove(event: TouchEvent): void {
    event.preventDefault();
    
    if (event.touches.length === 1 && this.isPanning && !this.isZooming) {
      // Single touch panning
      const deltaX = event.touches[0].clientX - this.touchStartX;
      const deltaY = event.touches[0].clientY - this.touchStartY;
      
      this.panX = this.lastPanX + deltaX;
      this.panY = this.lastPanY + deltaY;
      
      this.updateImageTransform();
    } else if (event.touches.length === 2 && this.isZooming) {
      // Two finger pinch zoom
      const touch1 = event.touches[0];
      const touch2 = event.touches[1];
      const currentDistance = this.getTouchDistance(touch1, touch2);
      
      const scaleChange = currentDistance / this.lastTouchDistance;
      const newZoom = this.currentZoom * scaleChange;
      
      this.currentZoom = Math.max(this.minZoom, Math.min(this.maxZoom, newZoom));
      this.lastTouchDistance = currentDistance;
      
      this.updateImageTransform();
    }
  }

  onTouchEnd(event: TouchEvent): void {
    if (event.touches.length === 0) {
      // Check for double-tap to reset zoom and pan
      const currentTime = Date.now();
      if (currentTime - this.lastTapTime < this.doubleTapDelay && !this.isPanning && !this.isZooming) {
        // Double tap detected - reset to default state
        this.currentZoom = 1;
        this.resetImageTransform();
        console.log('Double-tap detected: Reset zoom and pan');
      }
      this.lastTapTime = currentTime;
      
      this.isPanning = false;
      this.isZooming = false;
    } else if (event.touches.length === 1 && this.isZooming) {
      // Switch from zoom to pan if one finger lifted
      this.isZooming = false;
      this.isPanning = true;
      this.touchStartX = event.touches[0].clientX;
      this.touchStartY = event.touches[0].clientY;
      this.lastPanX = this.panX;
      this.lastPanY = this.panY;
    }
  }

  private getTouchDistance(touch1: Touch, touch2: Touch): number {
    const dx = touch1.clientX - touch2.clientX;
    const dy = touch1.clientY - touch2.clientY;
    return Math.sqrt(dx * dx + dy * dy);
  }

  private updateImageTransform(): void {
    const imageElement = this.imageElement?.nativeElement;
    if (imageElement) {
      // Apply bounds checking for panning
      const maxPanX = 100 * this.currentZoom;
      const maxPanY = 100 * this.currentZoom;
      
      this.panX = Math.max(-maxPanX, Math.min(maxPanX, this.panX));
      this.panY = Math.max(-maxPanY, Math.min(maxPanY, this.panY));
      
      const transform = `rotate(${this.currentRotation}deg) scale(${this.currentZoom}) translate(${this.panX / this.currentZoom}px, ${this.panY / this.currentZoom}px)`;
      imageElement.style.transform = transform;
    }
  }

  private resetImageTransform(): void {
    this.panX = 0;
    this.panY = 0;
    this.lastPanX = 0;
    this.lastPanY = 0;
  }
}