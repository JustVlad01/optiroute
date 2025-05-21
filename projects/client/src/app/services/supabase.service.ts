import { Injectable } from '@angular/core';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { environment } from '../../environments/environment.development';

@Injectable({
  providedIn: 'root'
})
export class SupabaseService {
  private supabase: SupabaseClient;

  constructor() {
    this.supabase = createClient(environment.supabaseUrl, environment.supabaseKey);
  }

  // Method to access the Supabase client instance
  getSupabase(): SupabaseClient {
    return this.supabase;
  }

  // Method to get all stores for the autocomplete
  async getAllStores(): Promise<any[]> {
    console.log('Fetching all stores for autocomplete');
    
    try {
      const { data, error } = await this.supabase
        .from('stores')
        .select('store_id, store_code, dispatch_code, store_name, dispatch_store_name, delivery_monday, delivery_tuesday, delivery_wednesday, delivery_thursday, delivery_friday, delivery_saturday');
      
      if (error) {
        console.error('Error fetching all stores:', error);
        throw error;
      }
      
      console.log(`Fetched ${data?.length || 0} stores`);
      return data || [];
    } catch (err) {
      console.error('Exception while fetching stores:', err);
      throw err;
    }
  }

  // Method to search for store across multiple fields
  async searchStoreAcrossFields(searchTerm: string): Promise<any[]> {
    console.log(`Searching for store with term: ${searchTerm}`);
    
    try {
      // First try exact matches on the most common fields
      const { data: exactMatches, error: exactError } = await this.supabase
        .from('stores')
        .select('*, delivery_monday, delivery_tuesday, delivery_wednesday, delivery_thursday, delivery_friday, delivery_saturday')
        .or(`store_code.eq.${searchTerm},dispatch_code.eq.${searchTerm}`);
      
      if (exactError) {
        console.error('Error searching stores with exact match:', exactError);
        throw exactError;
      }
      
      if (exactMatches && exactMatches.length > 0) {
        console.log(`Found ${exactMatches.length} stores with exact match`);
        return exactMatches;
      }
      
      // If no exact matches, try partial matches on store name
      const { data: partialMatches, error: partialError } = await this.supabase
        .from('stores')
        .select('*, delivery_monday, delivery_tuesday, delivery_wednesday, delivery_thursday, delivery_friday, delivery_saturday')
        .or(`dispatch_store_name.ilike.%${searchTerm}%,store_name.ilike.%${searchTerm}%`);
      
      if (partialError) {
        console.error('Error searching stores with partial match:', partialError);
        throw partialError;
      }
      
      console.log(`Found ${partialMatches?.length || 0} stores with partial match`);
      return partialMatches || [];
    } catch (err) {
      console.error('Exception during store search:', err);
      throw err;
    }
  }

  // Method to search for stores by field and value
  async searchStore(field: string, value: string): Promise<any[]> {
    console.log(`Searching for store with ${field} = ${value}`);
    
    try {
      const { data, error } = await this.supabase
        .from('stores')
        .select('*, delivery_monday, delivery_tuesday, delivery_wednesday, delivery_thursday, delivery_friday, delivery_saturday')
        .eq(field, value);
      
      if (error) {
        console.error('Error searching stores:', error);
        throw error;
      }
      
      console.log(`Found ${data?.length || 0} stores matching criteria`);
      return data || [];
    } catch (err) {
      console.error('Exception during store search:', err);
      throw err;
    }
  }

  // Method to get all orders with their related data
  async getOrders(): Promise<any[]> {
    console.log('Fetching all orders from Supabase');
    
    try {
      // Query the store_orders table with all necessary related data
      const { data, error } = await this.supabase
        .from('store_orders')
        .select(`
          id as store_id,
          import_id,
          file_name,
          import_date,
          order_delivery_date,
          order_status,
          route_id,
          route_name,
          route_number,
          driver_name,
          route_delivery_date,
          route_status,
          customer_name,
          customer_code,
          total_items,
          store_status
        `)
        .order('import_date', { ascending: false });
      
      if (error) {
        console.error('Error fetching orders:', error);
        throw error;
      }
      
      console.log(`Fetched ${data?.length || 0} order records`);
      return data || [];
    } catch (err) {
      console.error('Exception during orders fetch:', err);
      throw err;
    }
  }

  // Get the current session
  async getSession() {
    const { data, error } = await this.supabase.auth.getSession();
    
    if (error) {
      console.error('Error getting session:', error);
      return null;
    }
    
    return data.session;
  }

  // Method to find a driver by their custom ID
  async findDriverByCustomId(customId: string) {
    const { data, error } = await this.supabase
      .from('drivers')
      .select('id, name, custom_id, role, phone_number') // Updated to include role instead of vehicle_type
      .eq('custom_id', customId) // Filter by custom_id
      .single(); // Expect only one result or null

    if (error && error.code !== 'PGRST116') { // PGRST116 = no rows found, which is ok for login check
      console.error('Error finding driver:', error);
      return null;
    }

    return data; // Returns the driver object or null if not found
  }

  // Get a specific form assignment by ID
  async getFormAssignmentById(assignmentId: string) {
    const { data, error } = await this.supabase
      .from('driver_form_assignments')
      .select(`
        *,
        driver_forms:form_id (*)
      `)
      .eq('id', assignmentId)
      .single();

    if (error) {
      console.error('Error fetching form assignment:', error);
      return null;
    }

    return data;
  }

  // Method to save partial form data
  async savePartialFormData(assignmentId: string, formData: any) {
    console.log('Saving partial form data for assignment:', assignmentId);
    
    const { data, error } = await this.supabase
      .from('driver_form_assignments')
      .update({
        partial_form_data: formData,
        partially_completed: true
      })
      .eq('id', assignmentId)
      .select();

    if (error) {
      console.error('Error saving partial form data:', error);
      return null;
    }

    console.log('Partial form data saved:', data);
    return data;
  }

  // Get a specific driver form by ID
  async getDriverFormById(formId: string) {
    const { data, error } = await this.supabase
      .from('driver_forms')
      .select('*')
      .eq('id', formId)
      .single();

    if (error) {
      console.error('Error fetching driver form:', error);
      return null;
    }

    return data;
  }

  // Submit a driver form
  async submitDriverForm(formData: any) {
    console.log('Submitting driver form with raw data:', formData);
    
    // Format date if it's not already a string
    let dateValue = formData.date;
    if (dateValue instanceof Date) {
      dateValue = this.formatDate(dateValue);
    }

    // Ensure values for required fields
    const startingMileage = parseInt(formData.starting_mileage || formData.startingMileage || '0', 10);
    const numberOfCratesOut = parseInt(formData.number_of_crates_out || formData.numberOfCratesOut || '0', 10);
    const closingMileage = parseInt(formData.closing_mileage || formData.closingMileage || '0', 10) || null;
    const numberOfCratesIn = parseInt(formData.number_of_crates_in || formData.numberOfCratesIn || '0', 10) || null;
    
    // Build submission data with all required fields
    const submissionData = {
      driver_name: formData.driverName || formData.driver_name || '',
      date: dateValue || this.formatDate(new Date()),
      time: formData.time || this.formatTime(new Date()),
      shift_end_time: formData.shift_end_time || null,
      van_registration: formData.van_registration || formData.vanRegistration || '',
      starting_mileage: startingMileage,
      fuel_added: formData.fuel_added || formData.fuelAdded || false,
      litres_added: formData.litres_added || formData.litresAdded || null,
      fuel_card_reg: formData.fuel_card_reg || formData.fuelCardReg || null,
      full_uniform: formData.full_uniform || formData.fullUniform || false,
      all_site_keys: formData.all_site_keys || formData.allSiteKeys || false,
      work_start_time: formData.work_start_time || formData.workStartTime || this.formatTime(new Date()),
      preload_van_temp: formData.preload_van_temp || formData.preloadVanTemp || 0,
      preload_product_temp: formData.preload_product_temp || formData.preloadProductTemp || 0,
      auxiliary_products: formData.auxiliary_products || formData.auxiliaryProducts || false,
      number_of_crates_out: numberOfCratesOut,
      van_probe_serial_number: formData.van_probe_serial_number || formData.vanProbeSerialNumber || null,
      paperwork_issues: formData.paperwork_issues || formData.paperworkIssues || false,
      paperwork_issues_reason: formData.paperwork_issues_reason || formData.paperworkIssuesReason || null,
      
      // New end-of-shift fields
      closing_mileage: closingMileage,
      recycled_all_returns: formData.recycled_all_returns || formData.recycledAllReturns || false,
      van_fridge_working: formData.van_fridge_working || formData.vanFridgeWorking || false,
      returned_van_probe: formData.returned_van_probe || formData.returnedVanProbe || false,
      van_issues: formData.van_issues || formData.vanIssues || null,
      repairs_needed: formData.repairs_needed || formData.repairsNeeded || null,
      number_of_crates_in: numberOfCratesIn,
      needs_review: formData.needs_review || false
    };
    
    console.log('Formatted submission data:', submissionData);
    
    try {
      const { data, error } = await this.supabase
        .from('driver_forms')
        .insert([submissionData])
        .select();

      if (error) {
        console.error('Error submitting driver form:', error);
        return null;
      }

      console.log('Driver form submitted successfully:', data);
      return data;
    } catch (err) {
      console.error('Exception during form submission:', err);
      return null;
    }
  }
  
  // Helper function to format date as YYYY-MM-DD
  private formatDate(date: Date): string {
    const year = date.getFullYear();
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const day = date.getDate().toString().padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
  
  // Helper function to format time as HH:MM
  private formatTime(date: Date): string {
    const hours = date.getHours().toString().padStart(2, '0');
    const minutes = date.getMinutes().toString().padStart(2, '0');
    return `${hours}:${minutes}`;
  }

  // Update form assignment status
  async updateFormAssignmentStatus(assignmentId: string, status: string, formId?: string) {
    console.log('Updating form assignment status:', { assignmentId, status, formId });
    
    const updateData: any = {
      status: status
    };
    
    if (status === 'completed') {
      updateData.completed_at = new Date().toISOString();
      if (formId) {
        updateData.form_id = formId;
      }
    }
    
    const { data, error } = await this.supabase
      .from('driver_form_assignments')
      .update(updateData)
      .eq('id', assignmentId)
      .select();

    if (error) {
      console.error('Error updating form assignment status:', error);
      return null;
    }

    console.log('Form assignment status updated:', data);
    return data;
  }

  // Get form assignments for a specific driver
  async getDriverFormAssignments(driverId: string) {
    console.log('Getting form assignments for driver:', driverId);
    
    const { data, error } = await this.supabase
      .from('driver_form_assignments')
      .select(`
        *,
        driver_forms:form_id (*)
      `)
      .eq('driver_id', driverId)
      .order('due_date', { ascending: true });

    if (error) {
      console.error('Error fetching driver form assignments:', error);
      return null;
    }

    console.log(`Retrieved ${data?.length || 0} assignments for driver`);
    return data;
  }

  // Login with custom ID (without Supabase auth)
  async loginWithCustomId(customId: string) {
    console.log('Logging in with custom ID:', customId);
    
    try {
      // Find the driver by custom ID
      const driver = await this.findDriverByCustomId(customId);
      
      if (driver) {
        // Store driver info in localStorage
        localStorage.setItem('loggedInDriver', JSON.stringify(driver));
        return driver;
      }
      return null;
    } catch (error) {
      console.error('Error during login:', error);
      return null;
    }
  }

  // Save geolocation data
  async saveGeolocation(geolocationData: {
    driver_id?: string | null;
    dispatch_code: string | null;
    store_name: string | null;
    latitude: number;
    longitude: number;
    timestamp: string;
  }) {
    console.log('Saving geolocation data:', geolocationData);
    
    try {
      // Filter out undefined fields to let the database use defaults
      const dataToInsert = {
        ...(geolocationData.driver_id ? { driver_id: geolocationData.driver_id } : {}),
        dispatch_code: geolocationData.dispatch_code,
        store_name: geolocationData.store_name,
        latitude: geolocationData.latitude,
        longitude: geolocationData.longitude,
        timestamp: geolocationData.timestamp
      };
      
      const { data, error } = await this.supabase
        .from('driver_geolocations')
        .insert([dataToInsert])
        .select();

      if (error) {
        console.error('Error saving geolocation data:', error);
        return { data: null, error };
      }

      console.log('Geolocation data saved successfully:', data);
      return { data, error: null };
    } catch (err) {
      console.error('Exception during geolocation save:', err);
      return { data: null, error: err };
    }
  }

  // Method to update store location coordinates
  async updateStoreLocation(storeId: string, latitude: number, longitude: number): Promise<any> {
    console.log(`Updating store location for store ID ${storeId}: lat=${latitude}, long=${longitude}`);
    
    try {
      // First, fetch the current store record to check field names
      const { data: storeData, error: fetchError } = await this.supabase
        .from('stores')
        .select('*')
        .eq('store_id', storeId)
        .single();
      
      if (fetchError) {
        console.error('Error fetching store data:', fetchError);
        throw fetchError;
      }
      
      // Determine which field names to use (uppercase or lowercase)
      const updateData: any = {};
      
      // Check if fields exist and use appropriate case
      if ('Latitude' in storeData) {
        updateData.Latitude = latitude;
        updateData.Longitude = longitude;
      } else {
        updateData.latitude = latitude;
        updateData.longitude = longitude;
      }
      
      console.log('Updating with data:', updateData);
      
      const { data, error } = await this.supabase
        .from('stores')
        .update(updateData)
        .eq('store_id', storeId)
        .select();
      
      if (error) {
        console.error('Error updating store location:', error);
        throw error;
      }
      
      console.log('Store location updated successfully:', data);
      return data;
    } catch (err) {
      console.error('Exception during store location update:', err);
      throw err;
    }
  }
}
