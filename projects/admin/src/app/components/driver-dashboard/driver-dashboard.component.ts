import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { SupabaseService } from '../../services/supabase.service';

@Component({
  selector: 'app-driver-dashboard',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './driver-dashboard.component.html',
  styleUrls: ['./driver-dashboard.component.scss']
})
export class DriverDashboardComponent implements OnInit {
  driverId: string = '';
  driverName: string = '';
  assignedForms: any[] = [];
  completedForms: any[] = [];
  isLoading = true;
  
  // Performance related properties
  performanceImages: any[] = [];
  isLoadingPerformance = true;
  selectedPerformanceImage: any = null;
  
  // UI state properties
  showPerformanceSection = false; // Changed to default closed
  showDrivingPerformanceSection = true; // Default open the new section
  showFormsSection = false;
  activeFormsTab: 'pending' | 'completed' = 'pending';

  constructor(
    private router: Router,
    private supabaseService: SupabaseService
  ) {}

  async ngOnInit(): Promise<void> {
    console.log('=== Driver Dashboard Component Initializing ===');
    this.isLoading = true;
    this.isLoadingPerformance = true;
    
    try {
      // Get driver info from localStorage instead of session
      const loggedInDriverStr = localStorage.getItem('loggedInDriver');
      console.log('Logged in driver data:', loggedInDriverStr);
      
      if (loggedInDriverStr) {
        try {
          const driver = JSON.parse(loggedInDriverStr);
          this.driverId = driver.id;
          this.driverName = driver.name;
          console.log('Driver ID:', this.driverId);
          console.log('Driver Name:', this.driverName);
          
          await Promise.all([
            this.loadAssignedForms(),
            this.loadPerformanceImages()
          ]);
        } catch (e) {
          console.error('Error parsing logged in driver data', e);
          alert('Error loading driver data. Please try logging in again.');
          // Redirect to login if driver data is invalid
          this.router.navigate(['/login']);
        }
      } else {
        console.log('No logged in driver found, redirecting to login');
        // Not logged in, redirect to login
        this.router.navigate(['/login']);
      }
    } catch (error) {
      console.error('Error initializing driver dashboard:', error);
      alert('Error loading dashboard. Please refresh the page or try again later.');
      this.isLoading = false;
      this.isLoadingPerformance = false;
    }
  }

  // Section toggle methods
  togglePerformanceSection(): void {
    console.log('Performance section toggle clicked');
    // Toggle and close other sections
    this.showPerformanceSection = !this.showPerformanceSection;
    
    if (this.showPerformanceSection) {
      // Close other sections when opening this one
      this.showDrivingPerformanceSection = false;
      this.showFormsSection = false;
      
      // Force reload performance images
      this.isLoadingPerformance = true;
      this.loadPerformanceImages();
    }
  }
  
  toggleDrivingPerformanceSection(): void {
    console.log('Driving Performance section toggle clicked');
    // Toggle and close other sections
    this.showDrivingPerformanceSection = !this.showDrivingPerformanceSection;
    
    if (this.showDrivingPerformanceSection) {
      // Close other sections when opening this one
      this.showPerformanceSection = false;
      this.showFormsSection = false;
      
      // Force reload performance images
      this.isLoadingPerformance = true;
      this.loadPerformanceImages();
    }
  }
  
  toggleFormsSection(): void {
    console.log('Forms section toggle clicked');
    this.showFormsSection = !this.showFormsSection;
    
    if (this.showFormsSection) {
      this.showPerformanceSection = false;
      this.showDrivingPerformanceSection = false;
    }
  }
  
  setFormsTab(tab: 'pending' | 'completed'): void {
    this.activeFormsTab = tab;
  }

  async loadAssignedForms(): Promise<void> {
    if (!this.driverId) {
      this.isLoading = false;
      return;
    }

    try {
      const assignments = await this.supabaseService.getDriverFormAssignments(this.driverId);
      
      if (assignments) {
        // Separate pending/overdue from completed forms
        this.assignedForms = assignments.filter(a => a.status !== 'completed');
        this.completedForms = assignments.filter(a => a.status === 'completed');
        console.log('Loaded assigned forms:', this.assignedForms.length);
        console.log('Loaded completed forms:', this.completedForms.length);
      } else {
        console.error('Failed to load form assignments');
      }
    } catch (error) {
      console.error('Error loading assigned forms:', error);
    } finally {
      this.isLoading = false;
    }
  }

  async loadPerformanceImages(): Promise<void> {
    console.log('=== loadPerformanceImages started ===');
    this.isLoadingPerformance = true;
    
    if (!this.driverId) {
      console.error('No driver ID available');
      this.isLoadingPerformance = false;
      return;
    }

    console.log('Loading performance images for driver:', this.driverId);

    try {
      // Mock some test data if in development mode
      if (this.driverId === 'test' || this.driverId === 'demo' || !this.driverId) {
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
        this.isLoadingPerformance = false;
        console.log('Mock performance images loaded:', this.performanceImages.length);
        return;
      }

      // Check if Supabase service is available
      const supabase = this.supabaseService.getSupabase();
      if (!supabase) {
        console.error('Supabase client not available');
        alert('Error: Storage service not available');
        this.isLoadingPerformance = false;
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
        
        // Try to create the folder for this driver if it doesn't exist
        try {
          const { data: uploadData, error: uploadError } = await supabase
            .storage
            .from('driver-performance')
            .upload(`${this.driverId}/.keep`, new Blob([''], { type: 'text/plain' }));
            
          if (uploadError) {
            console.error('Error creating driver folder:', uploadError);
          } else {
            console.log('Created driver folder');
          }
        } catch (folderError) {
          console.error('Error creating driver folder:', folderError);
        }
        
        this.performanceImages = [];
        this.isLoadingPerformance = false;
        return;
      }

      console.log('Found performance image files:', data);
      
      if (!data || data.length === 0) {
        console.log('No performance images found for driver');
        this.performanceImages = [];
        this.isLoadingPerformance = false;
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
      console.log('First image URL:', this.performanceImages[0]?.url);
    } catch (error) {
      console.error('Exception loading performance images:', error);
      alert('Error loading performance images. Please try again.');
      this.performanceImages = [];
    } finally {
      this.isLoadingPerformance = false;
      console.log('=== loadPerformanceImages completed ===');
    }
  }

  openPerformanceImage(image: any): void {
    console.log('Opening performance image:', image.name);
    this.selectedPerformanceImage = image;
  }

  closePerformanceImage(): void {
    this.selectedPerformanceImage = null;
  }

  fillOutForm(assignmentId: string): void {
    // Navigate to the form filling page with the assignment ID
    this.router.navigate(['/driver/fill-form', assignmentId]);
  }

  viewForm(formId: string): void {
    // Navigate to view a completed form
    this.router.navigate(['/driver-forms/view', formId]);
  }

  getStatusClass(status: string): string {
    return status === 'overdue' ? 'status-overdue' : 'status-pending';
  }

  formatDueDate(dueDate: string): string {
    if (!dueDate) return 'No due date';
    
    const date = new Date(dueDate);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    if (date.getTime() === today.getTime()) {
      return 'Today';
    }
    
    const tomorrow = new Date(today);
    tomorrow.setDate(today.getDate() + 1);
    
    if (date.getTime() === tomorrow.getTime()) {
      return 'Tomorrow';
    }
    
    return date.toLocaleDateString();
  }

  async logout(): Promise<void> {
    // Clear localStorage and redirect to login
    localStorage.removeItem('loggedInDriver');
    this.router.navigate(['/login']);
  }
} 