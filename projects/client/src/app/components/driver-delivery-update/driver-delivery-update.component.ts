import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { SupabaseService } from '../../services/supabase.service';
import { Store, StoreDetails } from '../../services/models/store.model';
import { interval, Subscription } from 'rxjs';

interface StoreItem {
  storeId: string;
  storeDetails: StoreDetails;
}

interface Delivery {
  name: string;
  time: string;
  added: boolean;
  stores: StoreItem[];
}

@Component({
  selector: 'app-driver-delivery-update',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule],
  templateUrl: './driver-delivery-update.component.html',
  styleUrls: ['./driver-delivery-update.component.scss']
})
export class DriverDeliveryUpdateComponent implements OnInit, OnDestroy {
  selectedRoute: string = '';
  tempSelectedRoute: string = '';
  dublinRoutes: string[] = [
    'Dublin 1', 'Dublin 2', 'Dublin 3', 'Dublin 4', 'Dublin 5', 
    'Dublin 6', 'Dublin 7', 'Dublin 8', 'Dublin 9', 'Dublin 10',
    'Dublin 11', 'Dublin 12', 'Dublin 13', 'Dublin 14'
  ];
  
  driverComments: string = '';
  
  deliveries: Delivery[] = [
    { name: 'Starbucks', time: '09:00', added: false, stores: [] },
    { name: 'Circle K', time: '10:00', added: false, stores: [] },
    { name: 'Other', time: '10:30', added: false, stores: [] }
  ];
  
  lastDeliveries = [
    { name: 'Circle K', time: '--:--', hour: '', minute: '' },
    { name: 'Starbucks', time: '--:--', hour: '', minute: '' },
    { name: 'Other', time: '--:--', hour: '', minute: '' }
  ];

  hours = ['04', '05', '06', '07', '08', '09', '10', '11', '12', '13', '14', '15', '16'];
  minutes = ['00', '05', '10', '15', '20', '25', '30', '35', '40', '45', '50', '55'];

  // Store selection properties
  stores: Store[] = [];
  filteredStores: Store[] = [];
  storeSearchTerm: string = '';
  showStoreSelector: boolean = false;
  currentDeliveryIndex: number = -1;
  
  // Current update tracking
  currentUpdateId: string | null = null;
  driverId: string = '';
  isLoading: boolean = false;
  
  // Daily reset tracking
  currentFormDay: string = '';
  formattedCurrentDay: string = '';
  timeCheckSubscription: Subscription | null = null;
  autoSaveInProgress: boolean = false;

  constructor(private supabaseService: SupabaseService) { }

  ngOnInit(): void {
    this.loadStores();
    this.getLoggedInDriver();
    this.initializeFormDay();
    this.startTimeCheck();
  }
  
  ngOnDestroy(): void {
    if (this.timeCheckSubscription) {
      this.timeCheckSubscription.unsubscribe();
    }
  }
  
  private initializeFormDay(): void {
    // Format the current date as YYYY-MM-DD
    const now = new Date();
    this.currentFormDay = this.formatDateForStorage(now);
    this.updateFormattedDay(now);
    console.log('Initialized form for day:', this.currentFormDay);
    
    // Check if we need to create a new form or load an existing one
    this.checkForExistingFormToday();
  }
  
  private formatDateForStorage(date: Date): string {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  }
  
  private updateFormattedDay(date: Date): void {
    // Create a user-friendly date format (e.g., "Monday, January 1, 2023")
    const options: Intl.DateTimeFormatOptions = { 
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    };
    this.formattedCurrentDay = date.toLocaleDateString('en-US', options);
  }
  
  private startTimeCheck(): void {
    // Check every minute if we need to save or reset the form
    this.timeCheckSubscription = interval(60000).subscribe(() => {
      this.checkForNoonReset();
    });
  }
  
  private checkForNoonReset(): void {
    const now = new Date();
    const currentDay = this.formatDateForStorage(now);
    const hours = now.getHours();
    const minutes = now.getMinutes();
    
    // If it's exactly 12:00 PM (noon), auto-save and prepare for a new day
    if (hours === 12 && minutes === 0) {
      console.log('It is noon - auto-saving and preparing new form');
      this.autoSaveAllData();
    }
    
    // If the day has changed since we loaded the form, reset for a new day
    if (currentDay !== this.currentFormDay) {
      console.log('Day has changed from', this.currentFormDay, 'to', currentDay);
      this.resetFormForNewDay(currentDay);
    }
  }
  
  private async checkForExistingFormToday(): Promise<void> {
    if (!this.driverId) {
      console.warn('No driver ID available to check for existing form');
      return;
    }
    
    try {
      // Try to get the most recent form for today
      const { data, error } = await this.supabaseService.getSupabase()
        .from('driver_delivery_updates')
        .select('*')
        .eq('driver_id', this.driverId)
        .gte('created_at', `${this.currentFormDay}T00:00:00Z`)
        .lt('created_at', `${this.currentFormDay}T23:59:59Z`)
        .order('created_at', { ascending: false })
        .limit(1);
      
      if (error) {
        console.error('Error checking for existing form:', error);
        return;
      }
      
      if (data && data.length > 0) {
        // Found an existing form for today - load it
        console.log('Found existing form for today:', data[0]);
        this.loadExistingForm(data[0]);
      }
    } catch (err) {
      console.error('Exception checking for existing form:', err);
    }
  }
  
  private async resetFormForNewDay(newDay: string): Promise<void> {
    // Save any unsaved data before resetting
    if (this.currentUpdateId) {
      await this.autoSaveAllData();
    }
    
    // IMPORTANT: This only resets the client-side form state.
    // All previous forms remain safely stored in Supabase.
    // Each day gets a new database record, preserving historical data.
    
    // Reset form state
    this.currentFormDay = newDay;
    // Update the formatted day display
    const newDate = new Date(`${newDay}T00:00:00`);
    this.updateFormattedDay(newDate);
    
    this.currentUpdateId = null;
    this.driverComments = '';
    this.deliveries = [
      { name: 'Starbucks', time: '09:00', added: false, stores: [] },
      { name: 'Circle K', time: '10:00', added: false, stores: [] },
      { name: 'Other', time: '10:30', added: false, stores: [] }
    ];
    this.lastDeliveries = [
      { name: 'Circle K', time: '--:--', hour: '', minute: '' },
      { name: 'Starbucks', time: '--:--', hour: '', minute: '' },
      { name: 'Other', time: '--:--', hour: '', minute: '' }
    ];
    
    // If user has already selected a route, initialize a new form
    if (this.selectedRoute) {
      await this.initializeDeliveryUpdate();
    }
    
    console.log('Form reset for new day:', newDay);
  }
  
  private async autoSaveAllData(): Promise<void> {
    if (this.autoSaveInProgress || !this.currentUpdateId || !this.driverId) {
      return;
    }
    
    try {
      this.autoSaveInProgress = true;
      console.log('Auto-saving all form data...');
      
      // Format the data
      const deliveryData = this.deliveries.map(delivery => ({
        shop_name: delivery.name,
        delivery_time: delivery.time,
        stores: delivery.stores.map(store => ({
          store_id: store.storeId,
          store_code: store.storeDetails.code,
          store_name: store.storeDetails.name
        }))
      }));
      
      const lastDeliveryTimes: Record<string, string> = {};
      this.lastDeliveries.forEach(delivery => {
        lastDeliveryTimes[delivery.name] = delivery.time;
      });
      
      // Save everything at once
      const result = await this.supabaseService.updateDriverDeliveryUpdate(
        this.currentUpdateId, 
        {
          comments: this.driverComments,
          delivery_data: deliveryData,
          last_delivery_times: lastDeliveryTimes
        }
      );
      
      if (result.success) {
        console.log('Auto-save completed successfully');
      } else {
        console.error('Auto-save failed:', result.error);
      }
    } catch (error) {
      console.error('Error during auto-save:', error);
    } finally {
      this.autoSaveInProgress = false;
    }
  }
  
  private loadExistingForm(formData: any): void {
    this.currentUpdateId = formData.id;
    this.selectedRoute = formData.route_name || '';
    this.driverComments = formData.comments || '';
    
    // Load delivery data if it exists
    if (formData.delivery_data && Array.isArray(formData.delivery_data) && formData.delivery_data.length > 0) {
      this.deliveries = formData.delivery_data.map((delivery: any) => {
        return {
          name: delivery.shop_name || 'Unknown Shop',
          time: delivery.delivery_time || '--:--',
          added: delivery.stores && delivery.stores.length > 0,
          stores: (delivery.stores || []).map((store: any) => {
            return {
              storeId: store.store_id,
              storeDetails: {
                id: store.store_id,
                name: store.store_name || 'Unknown Store',
                code: store.store_code || 'N/A',
              }
            };
          })
        };
      });
    }
    
    // Load last delivery times if they exist
    if (formData.last_delivery_times && typeof formData.last_delivery_times === 'object') {
      this.lastDeliveries.forEach(delivery => {
        const savedTime = formData.last_delivery_times[delivery.name];
        if (savedTime) {
          delivery.time = savedTime;
          
          // Try to split the time to get hour and minute
          const timeParts = savedTime.split(':');
          if (timeParts.length === 2) {
            // Convert any time format to our new format
            let hour = timeParts[0].trim();
            // Remove am/pm suffix if present
            if (hour.endsWith('am')) {
              // For morning hours, ensure they have leading zeros
              const hourNum = parseInt(hour.replace('am', '').trim());
              hour = hourNum < 10 ? `0${hourNum}` : `${hourNum}`;
            } else if (hour.endsWith('pm')) {
              // For afternoon hours, convert to 24 hour format
              const hourNum = parseInt(hour.replace('pm', '').trim());
              hour = hourNum < 12 ? `${hourNum + 12}` : `${hourNum}`;
            }
            
            delivery.hour = hour;
            delivery.minute = timeParts[1].trim();
          }
        }
      });
    }
    
    console.log('Loaded existing form data');
  }

  private getLoggedInDriver(): void {
    const driverJson = localStorage.getItem('loggedInDriver');
    if (driverJson) {
      try {
        const driver = JSON.parse(driverJson);
        this.driverId = driver.id;
        console.log('Logged in driver ID:', this.driverId);
      } catch (error) {
        console.error('Error parsing driver data:', error);
      }
    } else {
      console.warn('No logged in driver found');
    }
  }

  async loadStores(): Promise<void> {
    try {
      this.stores = await this.supabaseService.getAllStores();
      console.log('Loaded stores:', this.stores.length);
    } catch (error) {
      console.error('Error loading stores:', error);
    }
  }

  confirmRouteSelection(): void {
    if (this.tempSelectedRoute) {
      this.selectedRoute = this.tempSelectedRoute;
      
      // Only initialize a new form if we don't already have one
      if (!this.currentUpdateId) {
        this.initializeDeliveryUpdate();
      }
    }
  }
  
  async initializeDeliveryUpdate(): Promise<void> {
    if (!this.driverId) {
      console.error('No driver ID available');
      return;
    }
    
    try {
      this.isLoading = true;
      const result = await this.supabaseService.saveDriverDeliveryUpdate({
        driver_id: this.driverId,
        route_name: this.selectedRoute,
        comments: '',
        delivery_data: [],
        last_delivery_times: {}
      });
      
      if (result.success && result.data && result.data.length > 0) {
        this.currentUpdateId = result.data[0].id;
        console.log('Created new update with ID:', this.currentUpdateId);
      } else {
        console.error('Failed to initialize delivery update');
      }
    } catch (error) {
      console.error('Error initializing delivery update:', error);
    } finally {
      this.isLoading = false;
    }
  }

  addStore(index: number): void {
    this.currentDeliveryIndex = index;
    this.showStoreSelector = true;
    this.storeSearchTerm = '';
    this.filteredStores = [];
  }

  addMoreStores(): void {
    // Add a new empty delivery to the list
    this.deliveries.push({
      name: 'New Shop',
      time: '--:--',
      added: false,
      stores: []
    });
  }

  searchStores(): void {
    if (!this.storeSearchTerm.trim()) {
      this.filteredStores = [];
      return;
    }
    
    this.filteredStores = this.stores.filter(store => {
      const storeName = store.store_name?.toLowerCase() || '';
      const dispatchStoreName = store.dispatch_store_name?.toLowerCase() || '';
      const storeCode = store.store_code?.toLowerCase() || '';
      const dispatchCode = store.dispatch_code?.toLowerCase() || '';
      const searchTerm = this.storeSearchTerm.toLowerCase();
      
      return storeName.includes(searchTerm) || 
             dispatchStoreName.includes(searchTerm) ||
             storeCode.includes(searchTerm) ||
             dispatchCode.includes(searchTerm);
    });
  }

  selectStore(store: Store): void {
    if (this.currentDeliveryIndex >= 0 && this.currentDeliveryIndex < this.deliveries.length) {
      const displayName = store.store_name || store.dispatch_store_name || 'Unknown Store';
      const delivery = this.deliveries[this.currentDeliveryIndex];
      
      // Create the store details
      const storeDetails: StoreDetails = {
        id: store.id,
        name: displayName,
        code: store.store_code || store.dispatch_code,
        address: store.address_line,
        city: store.city,
        county: store.county,
        eircode: store.eircode,
        location: {
          lat: store.latitude,
          lng: store.longitude
        }
      };
      
      // Add the store to the delivery's stores array
      delivery.stores.push({
        storeId: store.id,
        storeDetails: storeDetails
      });
      
      // Mark as having stores but don't change the original name
      delivery.added = true;
    }
    this.closeStoreSelector();
  }

  closeStoreSelector(): void {
    this.showStoreSelector = false;
    this.storeSearchTerm = '';
    this.filteredStores = [];
    this.currentDeliveryIndex = -1;
  }

  removeStore(deliveryIndex: number, storeIndex: number): void {
    if (deliveryIndex >= 0 && deliveryIndex < this.deliveries.length) {
      const delivery = this.deliveries[deliveryIndex];
      if (storeIndex >= 0 && storeIndex < delivery.stores.length) {
        delivery.stores.splice(storeIndex, 1);
        
        // Always keep the delivery marked as added so the name persists
        delivery.added = true;
      }
    }
  }

  async saveAdvancedNotification(): Promise<void> {
    console.log('Saving advanced notification');
    
    if (!this.currentUpdateId || !this.driverId) {
      console.error('No update ID or driver ID available');
      alert('Error: Unable to save notification. Please try again.');
      return;
    }
    
    try {
      this.isLoading = true;
      const result = await this.supabaseService.updateDriverDeliveryUpdate(
        this.currentUpdateId, 
        { comments: this.driverComments }
      );
      
      if (result.success) {
        console.log('Advanced notification saved successfully');
        alert('Advanced notification submitted successfully');
      } else {
        console.error('Failed to save advanced notification');
        alert('Error: Failed to submit notification. Please try again.');
      }
    } catch (error) {
      console.error('Error saving advanced notification:', error);
      alert('Error: Unable to submit notification. Please try again.');
    } finally {
      this.isLoading = false;
    }
  }

  async saveOutstandingDeliveries(): Promise<void> {
    console.log('Saving outstanding deliveries');
    
    if (!this.currentUpdateId || !this.driverId) {
      console.error('No update ID or driver ID available');
      alert('Error: Unable to save deliveries. Please try again.');
      return;
    }
    
    try {
      this.isLoading = true;
      
      // Format deliveries for storage
      const deliveryData = this.deliveries.map(delivery => ({
        shop_name: delivery.name,
        delivery_time: delivery.time,
        stores: delivery.stores.map(store => ({
          store_id: store.storeId,
          store_code: store.storeDetails.code,
          store_name: store.storeDetails.name
        }))
      }));
      
      const result = await this.supabaseService.updateDriverDeliveryUpdate(
        this.currentUpdateId, 
        { delivery_data: deliveryData }
      );
      
      if (result.success) {
        console.log('Outstanding deliveries saved successfully');
        alert('Outstanding deliveries submitted successfully');
      } else {
        console.error('Failed to save outstanding deliveries');
        alert('Error: Failed to submit deliveries. Please try again.');
      }
    } catch (error) {
      console.error('Error saving outstanding deliveries:', error);
      alert('Error: Unable to submit deliveries. Please try again.');
    } finally {
      this.isLoading = false;
    }
  }

  updateTime(index: number): void {
    const delivery = this.lastDeliveries[index];
    if (delivery.hour && delivery.minute && delivery.minute !== 'Min') {
      delivery.time = `${delivery.hour}:${delivery.minute}`;
    } else {
      delivery.time = '--:--';
    }
  }

  async saveLastDeliveryTimes(): Promise<void> {
    console.log('Saving last delivery times');
    
    if (!this.currentUpdateId || !this.driverId) {
      console.error('No update ID or driver ID available');
      alert('Error: Unable to save delivery times. Please try again.');
      return;
    }
    
    // Update all time displays before saving
    this.lastDeliveries.forEach((delivery, index) => {
      this.updateTime(index);
    });
    
    // Check if any delivery has an invalid time
    const hasInvalidTime = this.lastDeliveries.some(
      delivery => delivery.minute === 'Min' && delivery.hour
    );
    
    if (hasInvalidTime) {
      alert('Please select valid minutes for all delivery times.');
      return;
    }
    
    try {
      this.isLoading = true;
      
      // Format last delivery times for storage
      const lastDeliveryTimes: Record<string, string> = {};
      this.lastDeliveries.forEach(delivery => {
        lastDeliveryTimes[delivery.name] = delivery.time;
      });
      
      const result = await this.supabaseService.updateDriverDeliveryUpdate(
        this.currentUpdateId, 
        { last_delivery_times: lastDeliveryTimes }
      );
      
      if (result.success) {
        console.log('Last delivery times saved successfully');
        alert('Last delivery times submitted successfully');
      } else {
        console.error('Failed to save last delivery times');
        alert('Error: Failed to submit delivery times. Please try again.');
      }
    } catch (error) {
      console.error('Error saving last delivery times:', error);
      alert('Error: Unable to submit delivery times. Please try again.');
    } finally {
      this.isLoading = false;
    }
  }
} 