import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { SupabaseService } from '../../services/supabase.service';

@Component({
  selector: 'app-store-library',
  templateUrl: './store-library.component.html',
  styleUrl: './store-library.component.scss',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink]
})
export class StoreLibraryComponent implements OnInit {
  searchTerm: string = '';
  storeDetails: any = null;
  loading: boolean = false;
  error: string = '';
  savingLocation: boolean = false;
  
  // New properties for autocomplete
  filteredOptions: any[] = [];
  storesList: any[] = [];

  constructor(private supabaseService: SupabaseService) {}

  ngOnInit(): void {
    // Fetch all stores for autocomplete
    this.fetchAllStores();
  }
  
  fetchAllStores(): void {
    this.supabaseService.getAllStores()
      .then(stores => {
        if (stores && stores.length > 0) {
          this.storesList = stores.map(store => ({
            id: store.store_id,
            code: store.store_code || store.dispatch_code,
            name: store.dispatch_store_name || store.store_name,
            data: store
          }));
        }
      })
      .catch(err => {
        console.error('Error fetching stores:', err);
      });
  }
  
  onSearchInput(): void {
    if (this.searchTerm.length > 0) {
      // Filter based on search term (case insensitive)
      const term = this.searchTerm.toLowerCase();
      this.filteredOptions = this.storesList
        .filter(store => 
          (store.code && store.code.toLowerCase().includes(term)) || 
          (store.name && store.name.toLowerCase().includes(term))
        )
        .slice(0, 5); // Limit to 5 results
    } else {
      this.filteredOptions = [];
    }
  }
  
  selectSearchResult(result: any): void {
    this.searchTerm = result.code || result.name;
    this.filteredOptions = [];
    this.storeDetails = result.data;
  }

  searchStore(): void {
    if (!this.searchTerm) {
      this.error = 'Please enter a search term';
      return;
    }
    
    this.loading = true;
    this.error = '';
    this.storeDetails = null;
    
    // If we already have matching results in filteredOptions, use the first one
    if (this.filteredOptions.length > 0) {
      this.storeDetails = this.filteredOptions[0].data;
      this.filteredOptions = [];
      this.loading = false;
      return;
    }

    // Search across all fields (store_code, dispatch_code, dispatch_store_name)
    this.supabaseService.searchStoreAcrossFields(this.searchTerm)
      .then(result => {
        this.loading = false;
        if (result && result.length > 0) {
          this.storeDetails = result[0];
        } else {
          this.error = 'No store found with the provided information';
        }
      })
      .catch(err => {
        this.loading = false;
        this.error = 'Error searching for store: ' + (err.message || 'Unknown error');
        console.error('Store search error:', err);
      });
  }
  
  saveCurrentLocation(): void {
    if (!this.storeDetails || !this.storeDetails.store_id) {
      this.error = 'Store information is required to save location';
      return;
    }

    this.savingLocation = true;
    this.error = '';

    if (!navigator.geolocation) {
      this.error = 'Geolocation is not supported by your browser';
      this.savingLocation = false;
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const latitude = position.coords.latitude;
        const longitude = position.coords.longitude;
        
        this.supabaseService.updateStoreLocation(
          this.storeDetails.store_id, 
          latitude, 
          longitude
        )
        .then(() => {
          // Update both uppercase and lowercase properties in the local object
          this.storeDetails.Latitude = latitude;
          this.storeDetails.Longitude = longitude;
          this.storeDetails.latitude = latitude;
          this.storeDetails.longitude = longitude;
          
          // Show success message
          this.error = '';
          alert(`Location saved successfully! Latitude: ${latitude}, Longitude: ${longitude}`);
          
          this.savingLocation = false;
        })
        .catch(err => {
          this.error = 'Error saving location: ' + (err.message || 'Unknown error');
          this.savingLocation = false;
          console.error('Save location error:', err);
        });
      },
      (error) => {
        this.error = 'Error getting current location: ' + error.message;
        this.savingLocation = false;
        console.error('Geolocation error:', error);
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  }
} 