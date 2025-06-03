import { Component, OnInit, OnDestroy } from '@angular/core';
import { Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { Driver } from '../../services/models';
import { SupabaseService } from '../../services/supabase.service';
import { PwaService } from '../../services/pwa.service';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './dashboard.component.html',
  styleUrls: ['./dashboard.component.scss']
})
export class DashboardComponent implements OnInit, OnDestroy {
  driverName: string = 'User'; // Default name if not provided
  driverData: Driver | null = null;
  
  // Notification properties
  hasNewPerformanceData: boolean = false;
  newPerformanceCount: number = 0;
  
  // Interval for periodic checks
  private notificationCheckInterval: any;
  
  constructor(
    private router: Router,
    private supabaseService: SupabaseService
  ) { }

  async ngOnInit(): Promise<void> {
    // Check if we have driver data from login
    const savedDriverData = localStorage.getItem('loggedInDriver');
    if (savedDriverData) {
      try {
        this.driverData = JSON.parse(savedDriverData) as Driver;
        if (this.driverData && this.driverData.name) {
          this.driverName = this.driverData.name;
        }
        
        // Check for new performance data
        await this.checkForNewPerformanceData();
        
        // Set up periodic check every 2 minutes
        this.notificationCheckInterval = setInterval(() => {
          this.checkForNewPerformanceData();
        }, 120000); // 2 minutes
      } catch (e) {
        console.error('Error parsing saved driver data', e);
      }
    }
    
    // If no driver data, redirect to login
    if (!this.driverData) {
      this.router.navigate(['/login']);
    }
  }

  ngOnDestroy(): void {
    // Clean up the interval when component is destroyed
    if (this.notificationCheckInterval) {
      clearInterval(this.notificationCheckInterval);
    }
  }

  async checkForNewPerformanceData(): Promise<void> {
    if (!this.driverData) return;
    
    try {
      // Get the last time the user viewed performance data
      const lastViewedKey = `performance_last_viewed_${this.driverData.id}`;
      const lastViewed = localStorage.getItem(lastViewedKey);
      const lastViewedDate = lastViewed ? new Date(lastViewed) : new Date(0);
      
      // Check for new performance images
      const { data: imageFiles, error: imageError } = await this.supabaseService.getSupabase()
        .storage
        .from('driver-performance')
        .list(`${this.driverData.id}`);
      
      if (imageError) {
        console.error('Error checking for new images:', imageError);
        return;
      }
      
      // Check for new comments
      const { data: commentsData, error: commentsError } = await this.supabaseService.getSupabase()
        .from('driver_performance_comments')
        .select('created_at')
        .eq('driver_id', this.driverData.id)
        .gte('created_at', lastViewedDate.toISOString());
      
      if (commentsError) {
        console.error('Error checking for new comments:', commentsError);
        return;
      }
      
      // Count new items
      let newCount = 0;
      
      // Count new images
      if (imageFiles) {
        const newImages = imageFiles.filter(file => {
          if (file.name === '.keep') return false;
          const fileDate = new Date(file.created_at || file.updated_at);
          return fileDate > lastViewedDate;
        });
        newCount += newImages.length;
      }
      
      // Count new comments
      if (commentsData) {
        newCount += commentsData.length;
      }
      
      this.hasNewPerformanceData = newCount > 0;
      this.newPerformanceCount = newCount;
      
    } catch (error) {
      console.error('Error checking for new performance data:', error);
    }
  }

  markPerformanceAsViewed(): void {
    if (!this.driverData) return;
    
    const lastViewedKey = `performance_last_viewed_${this.driverData.id}`;
    localStorage.setItem(lastViewedKey, new Date().toISOString());
    
    // Reset notification state
    this.hasNewPerformanceData = false;
    this.newPerformanceCount = 0;
  }

  navigateToPerformance(): void {
    this.markPerformanceAsViewed();
    this.router.navigate(['/driver-performance']);
  }

  logout(): void {
    // Clear saved driver data
    localStorage.removeItem('loggedInDriver');
    // Redirect to login page
    this.router.navigate(['/login']);
  }
}
