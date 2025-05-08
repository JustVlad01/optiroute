import { Injectable } from '@angular/core';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { environment } from '../../environments/environment.development'; // Use development for now

@Injectable({
  providedIn: 'root'
})
export class SupabaseService {
  private supabase: SupabaseClient;
  private totalStoreCount: number | null = null;

  constructor() {
    console.log('Initializing Supabase service');
    console.log('Supabase URL:', environment.supabaseUrl);
    console.log('Supabase Key (first 5 chars):', environment.supabaseKey?.substring(0, 5));
    console.log('Auth disabled:', environment.disableAuth);
    
    // Configure Supabase client
    const options = environment.disableAuth ? {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
        detectSessionInUrl: false
      },
      global: {
        headers: {
          'X-Client-Info': 'optiroute-admin'
        }
      }
    } : undefined;
    
    this.supabase = createClient(
      environment.supabaseUrl, 
      environment.supabaseKey,
      options
    );
  }

  // Method to add a new driver
  async addDriver(name: string, customId: string, role: string, location: string, phoneNumber?: string) {
    console.log('Adding driver:', { name, customId, role, location });
    
    const { data, error } = await this.supabase
      .from('drivers') // Ensure this matches your table name
      .insert([
        { 
          name: name, 
          custom_id: customId, 
          role: role, 
          location: location,
          phone_number: phoneNumber 
        }
      ])
      .select(); // Use select() to get the inserted data back if needed

    if (error) {
      console.error('Error adding driver:', error);
      return null;
    }

    console.log('Driver added:', data);
    return data;
  }

  // Method to get all drivers
  async getAllDrivers() {
    console.log('Getting all drivers');
    
    const { data, error } = await this.supabase
      .from('drivers')
      .select('*')
      .order('name');

    if (error) {
      console.error('Error fetching drivers:', error);
      return null;
    }

    console.log(`Retrieved ${data?.length || 0} drivers`);
    return data;
  }

  // Method to delete a driver
  async deleteDriver(driverId: number) {
    console.log('Deleting driver with ID:', driverId);
    
    const { error } = await this.supabase
      .from('drivers')
      .delete()
      .eq('id', driverId);

    if (error) {
      console.error('Error deleting driver:', error);
      return false;
    }

    console.log('Driver deleted successfully');
    return true;
  }

  // Method to submit a driver form
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
    const numberOfCratesIn = parseInt(formData.number_of_crates_in || formData.numberOfCratesIn || '0', 10) || 0;
    
    // Build submission data with all required fields
    const submissionData = {
      driver_name: formData.driverName || formData.driver_name || '',
      date: dateValue || this.formatDate(new Date()),
      time: formData.time || this.formatTime(new Date()),
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
      cab_cleaned: formData.cab_cleaned || formData.cabCleaned || false,
      cab_not_cleaned_reason: formData.cab_not_cleaned_reason || formData.cabNotCleanedReason || null,
      chemicals_used: formData.chemicals_used || formData.chemicalsUsed || null,
      van_issues: formData.van_issues || formData.vanIssues || null,
      repairs_needed: formData.repairs_needed || formData.repairsNeeded || null,
      number_of_crates_in: numberOfCratesIn,
      needs_review: formData.needs_review || false
    };
    
    console.log('Formatted submission data:', submissionData);
    
    try {
      // Insert the driver form data
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

  // Method to get all driver forms
  async getAllDriverForms() {
    console.log('Getting all driver forms');
    
    const { data, error } = await this.supabase
      .from('driver_forms')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching driver forms:', error);
      return null;
    }

    console.log(`Retrieved ${data?.length || 0} driver forms`);
    return data;
  }

  // Method to assign a form to a driver
  async assignFormToDriver(driverId: string, dueDate?: string | null, notes?: string, resetPeriod?: number) {
    console.log('Assigning form to driver:', { driverId, dueDate, notes, resetPeriod });
    
    const { data, error } = await this.supabase
      .from('driver_form_assignments')
      .insert([
        {
          driver_id: driverId,
          due_date: dueDate || null,
          notes: notes || null,
          reset_period: resetPeriod || null
        }
      ])
      .select();

    if (error) {
      console.error('Error assigning form to driver:', error);
      return null;
    }

    console.log('Form assigned to driver:', data);
    return data;
  }

  // Method to get all form assignments
  async getAllFormAssignments() {
    console.log('Getting all form assignments');
    
    const { data, error } = await this.supabase
      .from('driver_form_assignments')
      .select(`
        *,
        drivers:driver_id (id, name, custom_id, role),
        driver_forms:form_id (*)
      `)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching form assignments:', error);
      return null;
    }

    console.log(`Retrieved ${data?.length || 0} form assignments`);
    return data;
  }

  // Method to get form assignments for a specific driver
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

  // Method to update a form assignment status
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
    
    // If signed and no completed_at timestamp exists yet, add it
    if (status === 'signed') {
      // First, check if the assignment already has a completed_at date
      const { data: existingAssignment } = await this.supabase
        .from('driver_form_assignments')
        .select('completed_at')
        .eq('id', assignmentId)
        .single();
      
      // Only set completed_at if it doesn't already exist
      if (!existingAssignment?.completed_at) {
        updateData.completed_at = new Date().toISOString();
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

  // Method to delete a form assignment
  async deleteFormAssignment(assignmentId: string) {
    console.log('Deleting form assignment:', assignmentId);
    
    const { error } = await this.supabase
      .from('driver_form_assignments')
      .delete()
      .eq('id', assignmentId);

    if (error) {
      console.error('Error deleting form assignment:', error);
      return false;
    }

    console.log('Form assignment deleted successfully');
    return true;
  }

  // Method to get the current session
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
      .select('id, name, custom_id, role, phone_number, location')
      .eq('custom_id', customId)
      .single();

    if (error && error.code !== 'PGRST116') { // PGRST116 = no rows found
      console.error('Error finding driver:', error);
      return null;
    }

    return data;
  }
  
  // Method to sign out
  async signOut() {
    const { error } = await this.supabase.auth.signOut();
    
    if (error) {
      console.error('Error signing out:', error);
      return false;
    }
    
    return true;
  }

  // Method to get a specific driver form by ID
  async getDriverFormById(formId: string) {
    console.log('Getting driver form by ID:', formId);
    
    const { data, error } = await this.supabase
      .from('driver_forms')
      .select('*')
      .eq('id', formId)
      .single();

    if (error) {
      console.error('Error fetching driver form:', error);
      return null;
    }

    console.log('Retrieved driver form:', data);
    return data;
  }

  // Method to get a specific form assignment by ID
  async getFormAssignmentById(assignmentId: string) {
    console.log('Getting form assignment by ID:', assignmentId);
    
    const { data, error } = await this.supabase
      .from('driver_form_assignments')
      .select('*')
      .eq('id', assignmentId)
      .single();

    if (error) {
      console.error('Error fetching form assignment:', error);
      return null;
    }

    console.log('Retrieved form assignment:', data);
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

  // Method to update the needs_review flag for a form
  async updateFormNeedsReview(formId: string, needsReview: boolean) {
    console.log('Updating form needs_review flag:', { formId, needsReview });
    
    const { data, error } = await this.supabase
      .from('driver_forms')
      .update({ needs_review: needsReview })
      .eq('id', formId)
      .select();

    if (error) {
      console.error('Error updating form needs_review flag:', error);
      return false;
    }

    console.log('Form needs_review flag updated:', data);
    return true;
  }

  // Method to get the total store count
  getTotalStoreCount(): number | null {
    return this.totalStoreCount;
  }

  // Method to get store information
  async getStoreInformation() {
    console.log('Getting store information');
    
    try {
      // First, get the total count of stores - using a separate count query
      const { count, error: countError } = await this.supabase
        .from('store_information')
        .select('*', { count: 'exact', head: true });
        
      if (countError) {
        console.error('Error getting store count:', countError);
        this.totalStoreCount = null;
      } else {
        console.log(`Total store count from database: ${count}`);
        // Store the total count globally to be used in the component
        this.totalStoreCount = count;
      }
      
      // Then retrieve stores with pagination
      const { data, error } = await this.supabase
        .from('store_information')
        .select('*')
        .order('store_name');
        
      if (error) {
        console.error('Error fetching store information:', error);
        return null;
      }

      console.log(`Retrieved ${data?.length || 0} store records`);
      
      // Attach the total count to the data array as a property
      if (data) {
        Object.defineProperty(data, 'totalCount', {
          value: this.totalStoreCount || data.length,
          writable: false,
          enumerable: true // Changed to true so it is enumerable
        });
      }
      
      return data;
    } catch (e) {
      console.error('Exception while fetching stores:', e);
      return null;
    }
  }
  
  // Method to update store information
  async updateStoreInformation(storeUpdates: any[]) {
    console.log('Updating store information:', storeUpdates);
    
    try {
      // Process each update individually to ensure we're updating the right record
      const results = [];
      
      for (const update of storeUpdates) {
        // Log the original update for debugging
        console.log('Processing update:', JSON.stringify(update));
        
        // Apply column name fixing to the update before processing
        const fixedUpdate = this.fixColumnNames(update);
        console.log('After column name fixing:', JSON.stringify(fixedUpdate));
        
        // Check if this is a door_code update and ensure it's properly formatted
        if ('door_code' in fixedUpdate) {
          console.log('Door code update detected:', fixedUpdate.door_code);
          // Ensure door_code is a string
          fixedUpdate.door_code = fixedUpdate.door_code?.toString() || '';
        }
        
        // First priority: Use id if available
        if (fixedUpdate.id) {
          try {
            const { data, error } = await this.supabase
              .from('store_information')
              .update(fixedUpdate)
              .eq('id', fixedUpdate.id)
              .select();
              
            if (error) {
              console.error('Error updating store by id:', error);
              console.error('Failed update payload:', JSON.stringify(fixedUpdate));
              results.push({ success: false, error });
            } else {
              console.log('Store updated by id:', data);
              results.push({ success: true, data });
            }
          } catch (err) {
            console.error('Exception during update by id:', err);
            console.error('Failed update payload:', JSON.stringify(fixedUpdate));
            results.push({ success: false, error: { message: err instanceof Error ? err.message : 'Unknown error' } });
          }
          continue; // Skip to the next update
        }
        
        // Second priority: Use dispatch_code and store_code combination
        if (fixedUpdate.dispatch_code && fixedUpdate.store_code) {
          const { data: existingRecord } = await this.supabase
            .from('store_information')
            .select('*')
            .eq('dispatch_code', fixedUpdate.dispatch_code)
            .eq('store_code', fixedUpdate.store_code)
            .maybeSingle();
          
          if (existingRecord) {
            // If the record exists, update it
            const { data, error } = await this.supabase
              .from('store_information')
              .update(fixedUpdate)
              .eq('dispatch_code', fixedUpdate.dispatch_code)
              .eq('store_code', fixedUpdate.store_code)
              .select();
              
            if (error) {
              console.error('Error updating existing store:', error);
              console.error('Failed update payload:', JSON.stringify(fixedUpdate));
              results.push({ success: false, error });
            } else {
              console.log('Store updated:', data);
              results.push({ success: true, data });
            }
          } else {
            // If no record exists, insert a new one
            const { data, error } = await this.supabase
              .from('store_information')
              .insert(fixedUpdate)
              .select();
              
            if (error) {
              console.error('Error inserting new store:', error);
              results.push({ success: false, error });
            } else {
              console.log('New store inserted:', data);
              results.push({ success: true, data });
            }
          }
          continue; // Skip to the third priority check
        }
        
        // Third priority: Use store_name as fallback
        if (fixedUpdate.store_name) {
          const { data: existingRecord } = await this.supabase
            .from('store_information')
            .select('*')
            .eq('store_name', fixedUpdate.store_name)
            .maybeSingle();
            
          if (existingRecord) {
            // If the record exists, update it
            const { data, error } = await this.supabase
              .from('store_information')
              .update(fixedUpdate)
              .eq('store_name', fixedUpdate.store_name)
              .select();
              
            if (error) {
              console.error('Error updating existing store by name:', error);
              console.error('Failed update payload:', JSON.stringify(fixedUpdate));
              results.push({ success: false, error });
            } else {
              console.log('Store updated by name:', data);
              results.push({ success: true, data });
            }
          } else {
            // If no record exists, insert a new one
            const { data, error } = await this.supabase
              .from('store_information')
              .insert(fixedUpdate)
              .select();
              
            if (error) {
              console.error('Error inserting new store:', error);
              results.push({ success: false, error });
            } else {
              console.log('New store inserted:', data);
              results.push({ success: true, data });
            }
          }
        } else {
          console.error('Cannot update store without proper identifiers:', fixedUpdate);
          results.push({ 
            success: false, 
            error: { message: 'Missing store identifiers (id, dispatch_code, store_code, or store_name)' } 
          });
        }
      }
      
      // Check if any updates failed
      const anyFailures = results.some(result => !result.success);
      if (anyFailures) {
        console.error('Some store updates failed:', results.filter(r => !r.success));
        return { 
          success: false, 
          error: { message: 'Some store updates failed' },
          results 
        };
      }
      
      // All updates succeeded
      return { 
        success: true, 
        data: results.map(r => r.data).flat(),
        results
      };
    } catch (e) {
      console.error('Exception while updating stores:', e);
      const errorMessage = e instanceof Error ? e.message : 'Unknown error';
      return { success: false, error: { message: errorMessage } };
    }
  }

  // Fix column names to match database schema
  private fixColumnNames(row: any): any {
    const fixedRow = { ...row };
    
    // Map of frontend column names to database column names
    const columnMapping: {[key: string]: string} = {
      'address': 'address_line_1',
      'store_name_1': 'store_full_name',
      'new_route': 'new_route_15_04',
      'date': 'date_21_04',
      'door': 'door_code' // Fix mapping - 'door' should be 'door_code'
      // Add any other mismatched column names here
    };
    
    // Handle text fields specifically to ensure proper type conversion
    const textFields = [
      'door_code', 'alarm_code', 'fridge_code', 'manual', 'dispatch_code', 
      'store_name', 'store_code', 'store_full_name', 'store_name_future',
      'address_line_1', 'old_route', 'new_route_15_04', 'date_21_04',
      'eircode', 'location_link', 'keys_available', 'hour_access_24',
      'mon', 'tue', 'wed', 'thur', 'fri', 'sat', 'earliest_delivery_time',
      'opening_time_saturday', 'openining_time_bankholiday', 'delivery_parking_instructions'
    ];
    
    // Replace any mismatched column names
    Object.keys(columnMapping).forEach(frontendName => {
      if (frontendName in fixedRow) {
        const dbName = columnMapping[frontendName];
        fixedRow[dbName] = fixedRow[frontendName];
        delete fixedRow[frontendName]; // This line is important, it removes the original frontend key
      }
    });
    
    // Ensure all text fields are properly converted to strings
    Object.keys(fixedRow).forEach(key => {
      if (textFields.includes(key) && fixedRow[key] !== null && fixedRow[key] !== undefined) {
        fixedRow[key] = String(fixedRow[key]);
      }
    });
    
    return fixedRow;
  }

  // Method to save imported order data by calling the stored procedure
  async saveImportedOrderData(parsedData: any): Promise<{ success: boolean; data?: any; error?: any }> {
    console.log('Attempting to save imported order data via RPC:', parsedData);

    if (!this.supabase) {
      console.error('Supabase client is not initialized.');
      return { success: false, error: { message: 'Supabase client not initialized.' } };
    }

    try {
      const { data, error } = await this.supabase.rpc('import_parsed_order_data', {
        p_parsed_data: parsedData // Ensure p_parsed_data matches your stored procedure's parameter name
      });

      if (error) {
        console.error('Error calling import_parsed_order_data stored procedure:', error);
        return { success: false, error };
      }

      console.log('Successfully called import_parsed_order_data:', data);
      return { success: true, data };
    } catch (rpcError) {
      console.error('Exception during RPC call to import_parsed_order_data:', rpcError);
      return { success: false, error: rpcError };
    }
  }
}
