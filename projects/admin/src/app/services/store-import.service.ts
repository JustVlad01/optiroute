import { Injectable } from '@angular/core';
import { SupabaseService } from './supabase.service';
import { BehaviorSubject } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class StoreImportService {
  private loadingSubject = new BehaviorSubject<boolean>(false);
  loading$ = this.loadingSubject.asObservable();

  private messageSubject = new BehaviorSubject<{type: 'success' | 'error', text: string} | null>(null);
  message$ = this.messageSubject.asObservable();

  constructor(private supabaseService: SupabaseService) { }

  async importStoresFromMatches(): Promise<void> {
    this.loadingSubject.next(true);
    this.messageSubject.next(null);
    
    try {
      // Fetch the store matches from the exported_store_matches table
      const { data: stores, error } = await this.supabaseService.client
        .from('exported_store_matches')
        .select('*');
      
      if (error) {
        throw error;
      }
      
      if (!stores || stores.length === 0) {
        this.messageSubject.next({
          type: 'error',
          text: 'No stores found in the exported_store_matches table'
        });
        return;
      }
      
      console.log(`Found ${stores.length} stores to import`);
      
      // Process each store and geocode it
      let successCount = 0;
      let errorCount = 0;
      
      for (const store of stores) {
        try {
          // Use address_line instead of the subdivided fields (address_line_1, city, state)
          const geocodeAddress = store.address_line || (store.eircode ? `${store.eircode}, Ireland` : '');
          
          // Skip if no address or eircode is available
          if (!geocodeAddress || geocodeAddress === '') {
            errorCount++;
            console.warn(`Store ${store.store_name} (ID: ${store.id}) has no address or eircode for geocoding`);
            continue;
          }
          
          // Use Google Maps Geocoding API
          const geocoder = new google.maps.Geocoder();
          
          // Use Promise to handle the geocode call
          const geocodeResult = await new Promise<google.maps.GeocoderResult | null>((resolve, reject) => {
            geocoder.geocode({ address: geocodeAddress }, (results, status) => {
              if (status === google.maps.GeocoderStatus.OK && results && results.length > 0) {
                resolve(results[0]);
              } else {
                console.warn(`Geocoding failed for store ${store.store_name}: ${status}`);
                resolve(null);
              }
            });
          });
          
          let lat = null;
          let lng = null;
          
          if (geocodeResult) {
            const location = geocodeResult.geometry.location;
            lat = location.lat();
            lng = location.lng();
            console.log(`Geocoded ${store.store_name} to ${lat}, ${lng}`);
          } else {
            console.warn(`Could not geocode ${store.store_name}`);
          }
          
          // Update the store with geocoded location - match the actual schema fields
          const { error: updateError } = await this.supabaseService.client
            .from('stores')
            .upsert({
              store_id: store.store_id || null,
              store_name: store.store_name,
              store_company: store.store_company,
              dispatch_code: store.dispatch_code,
              store_code: store.store_code,
              address_line: store.address_line, 
              eircode: store.eircode,
              geolocation: lat && lng ? `POINT(${lng} ${lat})` : null,
              location_link: lat && lng ? `https://maps.google.com/?q=${lat},${lng}` : null,
              alarm_code: store.alarm_code,
              fridge_code: store.fridge_code,
              hour_access_24: store.hour_access_24,
              earliest_delivery_time: store.earliest_delivery_time,
              opening_time_saturday: store.opening_time_saturday,
              opening_time_sunday: store.opening_time_sunday,
              openining_time_bankholiday: store.openining_time_bankholiday || store.opening_time_bankholiday
            }, {
              onConflict: 'store_code'
            });
          
          if (updateError) {
            console.error(`Error updating store ${store.store_name}:`, updateError);
            errorCount++;
          } else {
            successCount++;
          }
        } catch (storeError) {
          console.error(`Error processing store ${store.store_name}:`, storeError);
          errorCount++;
        }
      }
      
      this.messageSubject.next({
        type: successCount > 0 ? 'success' : 'error',
        text: `Imported ${successCount} stores successfully. ${errorCount > 0 ? `Failed to import ${errorCount} stores.` : ''}`
      });
      
    } catch (error: any) {
      console.error('Error importing stores:', error);
      this.messageSubject.next({
        type: 'error',
        text: `Error importing stores: ${error.message || 'Unknown error'}`
      });
    } finally {
      this.loadingSubject.next(false);
    }
  }
} 