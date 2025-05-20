import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { SupabaseService } from '../../services/supabase.service';
import { RouterModule } from '@angular/router';

@Component({
  selector: 'app-find-geolocation',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule],
  templateUrl: './find-geolocation.component.html',
  styleUrls: ['./find-geolocation.component.scss']
})
export class FindGeolocationComponent {
  dispatchCode: string = '';
  storeName: string = '';
  latitude: number | null = null;
  longitude: number | null = null;
  isLoading: boolean = false;
  message: string = '';
  messageType: 'success' | 'error' | '' = '';
  driverId: string = '';

  constructor(private supabaseService: SupabaseService) {
    // Get driver ID from local storage
    const savedDriverData = localStorage.getItem('loggedInDriver');
    if (savedDriverData) {
      try {
        const driverData = JSON.parse(savedDriverData);
        this.driverId = driverData.id;
      } catch (e) {
        console.error('Error parsing saved driver data', e);
      }
    }
  }

  getCurrentLocation(): void {
    if (!this.dispatchCode && !this.storeName) {
      this.showMessage('Please enter either a dispatch code or store name', 'error');
      return;
    }

    this.isLoading = true;
    this.message = 'Obtaining current location...';
    this.messageType = '';

    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          this.latitude = position.coords.latitude;
          this.longitude = position.coords.longitude;
          this.isLoading = false;
          this.saveGeolocation();
        },
        (error) => {
          this.isLoading = false;
          console.error('Error getting location:', error);
          let errorMessage = 'Could not retrieve your location.';
          
          switch (error.code) {
            case error.PERMISSION_DENIED:
              errorMessage += ' Location permission denied.';
              break;
            case error.POSITION_UNAVAILABLE:
              errorMessage += ' Location information unavailable.';
              break;
            case error.TIMEOUT:
              errorMessage += ' Location request timed out.';
              break;
          }
          
          this.showMessage(errorMessage, 'error');
        },
        { enableHighAccuracy: true }
      );
    } else {
      this.isLoading = false;
      this.showMessage('Geolocation is not supported by this browser', 'error');
    }
  }

  async saveGeolocation(): Promise<void> {
    if (!this.latitude || !this.longitude) {
      this.showMessage('Missing location coordinates', 'error');
      return;
    }

    try {
      const { data, error } = await this.supabaseService.saveGeolocation({
        dispatch_code: this.dispatchCode || null,
        store_name: this.storeName || null,
        latitude: this.latitude,
        longitude: this.longitude,
        timestamp: new Date().toISOString()
      });

      if (error) {
        console.error('Error saving geolocation:', error);
        // Handle error message safely
        const errorMsg = typeof error === 'object' && error !== null && 'message' in error 
          ? error.message 
          : 'Unknown error';
        this.showMessage('Failed to save location data: ' + errorMsg, 'error');
        return;
      }

      this.showMessage('Location saved successfully!', 'success');
      // Clear input fields after successful save
      this.dispatchCode = '';
      this.storeName = '';
    } catch (err) {
      console.error('Exception saving geolocation:', err);
      this.showMessage('An error occurred while saving location', 'error');
    }
  }

  private showMessage(message: string, type: 'success' | 'error' | ''): void {
    this.message = message;
    this.messageType = type;
    
    // Clear message after 5 seconds
    setTimeout(() => {
      this.message = '';
      this.messageType = '';
    }, 5000);
  }
} 