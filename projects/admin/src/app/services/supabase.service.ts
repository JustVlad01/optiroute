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
    
    // Initialize Supabase storage buckets
    this.initializeStorageBuckets();
  }
  
  // Initialize storage buckets
  private async initializeStorageBuckets() {
    try {
      // Check if buckets exist
      const { data: buckets, error } = await this.supabase.storage.listBuckets();
      
      if (error) {
        console.error('Error listing buckets:', error);
        return;
      }
      
      console.log('Available buckets:', buckets);
      
      // Create driver-performance bucket if it doesn't exist
      const driverPerfBucket = buckets?.find(b => b.name === 'driver-performance');
      
      if (!driverPerfBucket) {
        console.log('Creating driver-performance bucket');
        
        const { data, error: createError } = await this.supabase.storage.createBucket('driver-performance', {
          public: false,
          allowedMimeTypes: ['image/png', 'image/jpeg', 'image/gif'],
          fileSizeLimit: 10485760 // 10MB
        });
        
        if (createError) {
          console.error('Error creating driver-performance bucket:', createError);
        } else {
          console.log('Created driver-performance bucket:', data);
        }
      } else {
        console.log('Driver performance bucket already exists');
      }

      // Create rejected-order bucket if it doesn't exist
      const rejectedOrderBucket = buckets?.find(b => b.name === 'rejected-order');
      
      if (!rejectedOrderBucket) {
        console.log('Creating rejected-order bucket');
        
        const { data, error: createError } = await this.supabase.storage.createBucket('rejected-order', {
          public: true,
          allowedMimeTypes: ['image/png', 'image/jpeg', 'image/gif'],
          fileSizeLimit: 10485760 // 10MB
        });
        
        if (createError) {
          console.error('Error creating rejected-order bucket:', createError);
        } else {
          console.log('Created rejected-order bucket:', data);
        }
      } else {
        console.log('Rejected order bucket already exists');
      }
    } catch (err) {
      console.error('Exception initializing storage buckets:', err);
    }
  }

  // Add method to get Supabase client
  getSupabase(): SupabaseClient {
    return this.supabase;
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

  // Method to reset a driver's password
  async resetDriverPassword(driverId: number) {
    console.log('Resetting password for driver with ID:', driverId);
    
    const { error } = await this.supabase
      .from('drivers')
      .update({ password: null })
      .eq('id', driverId);

    if (error) {
      console.error('Error resetting driver password:', error);
      return false;
    }

    console.log('Driver password reset successfully');
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

  // Method to assign forms to all drivers at once
  async assignFormToAllDrivers(dueDate?: string | null, notes?: string, resetPeriod?: number) {
    console.log('Assigning forms to all drivers');
    
    // First, get all drivers
    const drivers = await this.getAllDrivers();
    if (!drivers || drivers.length === 0) {
      console.log('No drivers found to assign forms to');
      return null;
    }

    // Create assignment records for all drivers
    const assignments = drivers.map(driver => ({
      driver_id: driver.id,
      due_date: dueDate || null,
      notes: notes || 'Form assigned to all drivers',
      reset_period: resetPeriod || 24
    }));

    const { data, error } = await this.supabase
      .from('driver_form_assignments')
      .insert(assignments)
      .select();

    if (error) {
      console.error('Error assigning forms to all drivers:', error);
      return null;
    }

    console.log(`Forms assigned to ${data?.length || 0} drivers`);
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
    console.log('SupabaseService: Starting deletion for assignment ID:', assignmentId);
    
    try {
      // First, let's check if the assignment exists
      const { data: existingAssignment, error: checkError } = await this.supabase
        .from('driver_form_assignments')
        .select('id, form_id, driver_id, status')
        .eq('id', assignmentId)
        .single();

      if (checkError) {
        console.error('Error checking if assignment exists:', checkError);
        if (checkError.code === 'PGRST116') {
          console.log('Assignment not found, may have already been deleted');
          return true; // Assignment doesn't exist, consider it successfully deleted
        }
        return false;
      }

      console.log('Assignment found before deletion:', existingAssignment);

      // If there's a related form_id, we need to handle it carefully
      if (existingAssignment.form_id) {
        console.log('Assignment has related form_id:', existingAssignment.form_id);
        // Set form_id to null first to avoid constraint issues
        const { error: updateError } = await this.supabase
          .from('driver_form_assignments')
          .update({ form_id: null })
          .eq('id', assignmentId);

        if (updateError) {
          console.error('Error removing form_id reference:', updateError);
          // Continue with deletion anyway
        } else {
          console.log('Successfully removed form_id reference');
        }
      }

      // Now attempt the deletion
      const { error: deleteError } = await this.supabase
        .from('driver_form_assignments')
        .delete()
        .eq('id', assignmentId);

      if (deleteError) {
        console.error('Error during deletion:', deleteError);
        console.error('Error details:', {
          code: deleteError.code,
          message: deleteError.message,
          details: deleteError.details,
          hint: deleteError.hint
        });
        return false;
      }

      // Verify the deletion was successful
      const { data: verifyData, error: verifyError } = await this.supabase
        .from('driver_form_assignments')
        .select('id')
        .eq('id', assignmentId)
        .single();

      if (verifyError && verifyError.code === 'PGRST116') {
        console.log('Deletion verified: Assignment no longer exists in database');
        return true;
      } else if (verifyData) {
        console.error('Deletion failed: Assignment still exists in database');
        return false;
      }

      console.log('Form assignment deleted successfully');
      return true;
    } catch (error) {
      console.error('Unexpected error during deletion:', error);
      return false;
    }
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

  // Method to get store information directly from store_information table
  async getStoreInformation(): Promise<any[]> {
    if (!this.supabase) {
      console.error('Supabase client is not initialized.');
      return [];
    }

    try {
      console.log('Querying stores table...');
      
      // Reset the total store count to ensure we're not using cached data
      this.totalStoreCount = null;
      
      // Fetch from the 'stores' table with pagination
      let allData: any[] = [];
      let hasMore = true;
      let page = 0;
      const pageSize = 1000; // Supabase's default and likely maximum allowed
      
      while (hasMore) {
        const { data, error } = await this.supabase
          .from('stores')
          .select(`
            *,
            store_additional_info(id, content, created_at, updated_at),
            store_images(id, file_path, url, file_name, instructions, uploaded_at, created_at, is_storefront)
          `)
          .range(page * pageSize, (page + 1) * pageSize - 1)
          .order('store_name');
        
        if (error) {
          console.error(`Error querying stores table page ${page}:`, error.message);
          break;
        }
        
        if (data && data.length > 0) {
          allData = [...allData, ...data];
          console.log(`Retrieved ${data.length} records from stores (page ${page + 1})`);
          
          // Check if we've reached the end
          if (data.length < pageSize) {
            hasMore = false;
          } else {
            page++;
          }
        } else {
          hasMore = false;
        }
      }
      
      // Set the total store count
      this.totalStoreCount = allData.length;
      console.log(`Retrieved ${allData.length} store records in total`);
      
      return allData;
    } catch (err) {
      console.error('Unexpected error in getStoreInformation:', err);
      return [];
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
        
        // First priority: Use id if available (UUID PRIMARY KEY)
        if (fixedUpdate.id) {
          try {
            const { data, error } = await this.supabase
              .from('stores')
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
            .from('stores')
            .select('*')
            .eq('dispatch_code', fixedUpdate.dispatch_code)
            .eq('store_code', fixedUpdate.store_code)
            .maybeSingle();
          
          if (existingRecord) {
            // If the record exists, update it
            const { data, error } = await this.supabase
              .from('stores')
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
              .from('stores')
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
          continue; // Skip to the next priority check
        }
        
        // Third priority: Use store_name as fallback
        if (fixedUpdate.store_name) {
          const { data: existingRecord } = await this.supabase
            .from('stores')
            .select('*')
            .eq('store_name', fixedUpdate.store_name)
            .maybeSingle();
            
          if (existingRecord) {
            // If the record exists, update it
            const { data, error } = await this.supabase
              .from('stores')
              .update(fixedUpdate)
              .eq('store_name', fixedUpdate.store_name)
              .select();
              
            if (error) {
              console.error('Error updating store by name:', error);
              results.push({ success: false, error });
            } else {
              console.log('Store updated by name:', data);
              results.push({ success: true, data });
            }
          } else {
            // If no record exists with this name, insert a new one
            const { data, error } = await this.supabase
              .from('stores')
              .insert(fixedUpdate)
              .select();
              
            if (error) {
              console.error('Error inserting new store by name:', error);
              results.push({ success: false, error });
            } else {
              console.log('New store inserted by name:', data);
              results.push({ success: true, data });
            }
          }
          continue;
        }
        
        // If we get here, we couldn't identify the record to update
        console.error('Could not identify store record to update:', fixedUpdate);
        results.push({ 
          success: false, 
          error: { message: 'No unique identifier (id, dispatch_code+store_code, or store_name) found to update the store' } 
        });
      }
      
      // Return all results
      return results;
    } catch (err) {
      console.error('Unexpected error in updateStoreInformation:', err);
      return [{ success: false, error: { message: 'Unexpected error during update' } }];
    }
  }

  // Fix column names to match database schema
  private fixColumnNames(row: any): any {
    const fixedRow = { ...row };
    
    // Remove additionalInfo from the update object as it's stored in a separate table
    if ('additionalInfo' in fixedRow) {
      delete fixedRow.additionalInfo;
    }
    
    // Remove fields that don't exist in the database schema
    const nonExistentColumns = ['opening_time_sunday', 'opening_time_saturday'];
    nonExistentColumns.forEach(column => {
      if (column in fixedRow) {
        delete fixedRow[column];
      }
    });
    
    // Map of frontend column names to database column names
    const columnMapping: {[key: string]: string} = {
      'address': 'address_line',
      'store_name_1': 'store_name',
      'new_route': 'route',
      'date': 'created_at',
      'door': 'door_code',
      'keys': 'keys_available',
      'store_id': 'id' // Map old store_id to new id (UUID)
      // Note: Removed the problematic mapping for opening_time fields
    };
    
    // Handle text fields specifically to ensure proper type conversion
    const textFields = [
      'manual', 'images', 'dispatch_code', 'dispatch_store_name', 'site_id',
      'store_code', 'store_company', 'store_name', 'address_line',
      'city', 'county', 'eircode', 'latitude', 'longitude', 'route', 
      'alarm_code', 'fridge_code', 'keys_available', 'key_code',
      'prior_registration_required', 'hour_access_24',
      'email', 'phone', 'opening_time_weekdays', 'opening_time_sat', 'opening_time_bankholiday',
      'deliver_monday', 'deliver_tuesday', 'deliver_wednesday', 'deliver_thursday', 'deliver_friday', 'deliver_saturday'
    ];
    
    // Replace any mismatched column names
    Object.keys(columnMapping).forEach(frontendName => {
      if (frontendName in fixedRow) {
        const dbName = columnMapping[frontendName];
        fixedRow[dbName] = fixedRow[frontendName];
        delete fixedRow[frontendName]; // This line is important, it removes the original frontend key
      }
    });
    
    // Ensure all text fields are properly stored as strings
    textFields.forEach(field => {
      if (field in fixedRow && fixedRow[field] !== null && fixedRow[field] !== undefined) {
        fixedRow[field] = fixedRow[field].toString();
      }
    });
    
    // Remove any legacy fields that don't exist in the new schema
    // but keep track of them in case we want to restore later
    const legacyFields = ['custom_id', 'delivery_parking_instructions', 'door_code'];
    const removedFields: {[key: string]: any} = {};
    
    legacyFields.forEach(field => {
      if (field in fixedRow) {
        removedFields[field] = fixedRow[field];
        delete fixedRow[field];
      }
    });
    
    // If we have legacy fields, consider storing them in a notes field or additional_info
    if (Object.keys(removedFields).length > 0) {
      console.log('Removed legacy fields:', removedFields);
      // You might want to add code here to store this information in a compatible field
    }
    
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

  // Method to get all imported orders
  async getAllImportedOrders() {
    console.log('Getting all imported orders');
    
    try {
      const { data, error } = await this.supabase.rpc('get_all_orders');
      
      if (error) {
        console.error('Error fetching imported orders:', error);
        throw error;
      }
      
      console.log(`Retrieved order data with ${data?.length || 0} records`);
      return data;
    } catch (error) {
      console.error('Exception during getAllImportedOrders:', error);
      throw error;
    }
  }

  // Method to get driver forms by date range
  async getDriverFormsByDateRange(startDate: string, endDate: string) {
    console.log('Getting driver forms by date range:', { startDate, endDate });
    
    try {
      const { data, error } = await this.supabase
        .from('driver_forms')
        .select('*')
        .gte('date', startDate)
        .lte('date', endDate)
        .order('date', { ascending: true });

      if (error) {
        console.error('Error fetching driver forms by date range:', error);
        return null;
      }

      console.log(`Retrieved ${data?.length || 0} driver forms for date range`);
      return data;
    } catch (err) {
      console.error('Exception during fetching driver forms by date range:', err);
      return null;
    }
  }

  // Method to process masterfile matches for an import
  async processMasterfileMatches(importId: number) {
    console.log('Processing masterfile matches for import ID:', importId);
    
    try {
      // Fix the API endpoint URL
      const baseUrl = window.location.origin; // Get the base URL including protocol, domain and port
      const url = `${baseUrl}/api/process-masterfile-matches/${importId}`;
      console.log('Calling API endpoint:', url);
      
      // Use XMLHttpRequest for better error handling
      return new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open('POST', url);
        xhr.setRequestHeader('Content-Type', 'application/json');
        
        xhr.onload = function() {
          if (xhr.status >= 200 && xhr.status < 300) {
            try {
              const result = JSON.parse(xhr.responseText);
              console.log('Masterfile matches processing result:', result);
              resolve({ success: true, data: result });
            } catch (parseError) {
              console.error('Error parsing success response:', parseError);
              resolve({ success: false, error: 'Invalid response format from server' });
            }
          } else {
            console.error('Error response:', xhr.status, xhr.statusText, xhr.responseText);
            try {
              const errorData = JSON.parse(xhr.responseText);
              resolve({ success: false, error: errorData.error || `Failed to process matches: ${xhr.status} ${xhr.statusText}` });
            } catch (parseError) {
              resolve({ success: false, error: `HTTP Error: ${xhr.status} ${xhr.statusText}` });
            }
          }
        };
        
        xhr.onerror = function() {
          console.error('Network error during processing');
          resolve({ success: false, error: 'Network or server error' });
        };
        
        xhr.send();
      });
    } catch (error) {
      console.error('Exception during masterfile matches processing:', error);
      return { success: false, error: 'Network or server error' };
    }
  }

  // Method to get processed masterfile matches for an import
  async getMasterfileMatches(importId: number) {
    console.log('Getting masterfile matches for import ID:', importId);
    
    try {
      // Fix the API endpoint URL
      const baseUrl = window.location.origin; // Get the base URL including protocol, domain and port
      const url = `${baseUrl}/api/masterfile-matches/${importId}`;
      console.log('Calling API endpoint:', url);
      
      // Use XMLHttpRequest for better error handling
      return new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open('GET', url);
        
        xhr.onload = function() {
          if (xhr.status >= 200 && xhr.status < 300) {
            try {
              const data = JSON.parse(xhr.responseText);
              console.log(`Retrieved ${data?.length || 0} masterfile matches`);
              resolve({ success: true, data });
            } catch (parseError) {
              console.error('Error parsing success response:', parseError, xhr.responseText);
              resolve({ success: false, error: 'Invalid response format from server' });
            }
          } else {
            console.error('Error response:', xhr.status, xhr.statusText, xhr.responseText);
            try {
              const errorData = JSON.parse(xhr.responseText);
              resolve({ success: false, error: errorData.error || `Failed to retrieve matches: ${xhr.status} ${xhr.statusText}` });
            } catch (parseError) {
              console.error('Failed to parse error response:', parseError, xhr.responseText);
              resolve({ success: false, error: `HTTP Error: ${xhr.status} ${xhr.statusText}` });
            }
          }
        };
        
        xhr.onerror = function() {
          console.error('Network error during retrieval');
          resolve({ success: false, error: 'Network or server error' });
        };
        
        xhr.send();
      });
    } catch (error) {
      console.error('Exception during masterfile matches retrieval:', error);
      return { success: false, error: 'Network or server error' };
    }
  }

  // Method to save manual store matches in the database
  async saveManualStoreMatch(
    orderStoreId: string, 
    masterfileStoreId: string, 
    customerName: string, 
    customerCode: string
  ): Promise<{ success: boolean; data?: any; error?: any }> {
    console.log('Saving manual store match:', {
      orderStoreId,
      masterfileStoreId,
      customerName,
      customerCode
    });

    if (!this.supabase) {
      console.error('Supabase client is not initialized.');
      return { success: false, error: { message: 'Supabase client not initialized.' } };
    }

    try {
      // First, disable RLS for store_matches table for this session
      await this.supabase.rpc('disable_rls_for_table', { table_name: 'store_matches' });

      // First check if we already have a persistent match for this customer name/code combination
      const { data: existingMatches, error: lookupError } = await this.supabase
        .from('store_matches')
        .select('*')
        .eq('customer_name', customerName)
        .eq('customer_code', customerCode);
      
      if (lookupError) {
        console.error('Error checking for existing manual matches:', lookupError);
        return { success: false, error: lookupError };
      }
      
      // Get the store data we're matching to so we can use it for display
      const { data: storeData, error: storeError } = await this.supabase
        .from('stores')
        .select('*')
        .eq('store_id', masterfileStoreId)
        .single();
        
      if (storeError) {
        console.error('Error fetching store data:', storeError);
        return { success: false, error: storeError };
      }
      
      console.log('Found store data for manual match:', storeData);
      
      // Step 1: Save or update the match in store_matches table
      let matchData;
      
      // If we already have a match, update it instead of creating a new one
      if (existingMatches && existingMatches.length > 0) {
        const { data, error } = await this.supabase
          .from('store_matches')
          .update({
            masterfile_store_id: masterfileStoreId,
            last_updated: new Date().toISOString()
          })
          .eq('id', existingMatches[0].id)
          .select();
        
        if (error) {
          console.error('Error updating existing store match:', error);
          return { success: false, error };
        }
        
        console.log('Updated existing store match:', data);
        matchData = data;
      } else {
        // If no existing match, insert a new one
        console.log('Inserting new match with data:', {
          customer_name: customerName,
          customer_code: customerCode,
          masterfile_store_id: masterfileStoreId
        });

        const { data, error } = await this.supabase
          .from('store_matches')
          .insert({
            customer_name: customerName,
            customer_code: customerCode,
            masterfile_store_id: masterfileStoreId,
            last_updated: new Date().toISOString(),
            created_at: new Date().toISOString()
          })
          .select();
        
        if (error) {
          console.error('Error creating store match:', error);
          return { success: false, error };
        }
        
        console.log('Created new store match:', data);
        matchData = data;
      }
      
      // Step 2: Update any existing store orders in the database with this customer name/code
      // This will ensure that current orders are updated with the new match
      
      // First, find the store order by ID to get its import_id
      const { data: storeOrder, error: storeOrderError } = await this.supabase
        .from('store_orders')
        .select('*')
        .eq('id', orderStoreId)
        .single();
      
      if (storeOrderError) {
        console.error('Error finding store order:', storeOrderError);
        // Continue anyway since we've already saved the match
      } else if (storeOrder) {
        console.log('Found store order:', storeOrder);
        
        // Try to update any processed matches for this customer
        try {
          // Update processed_masterfile_matches if it exists
          const { data: updatedMatches, error: updateError } = await this.supabase
            .from('processed_masterfile_matches')
            .update({
              master_store_id: masterfileStoreId,
              match_type: 'manual_match'
            })
            .eq('store_id', orderStoreId)
            .select();
          
          console.log('Updated processed matches:', updatedMatches);
          
          // Update store_orders_masterfile_matches if it exists
          const { data: updatedOrderMatches, error: updateOrderError } = await this.supabase
            .from('store_orders_masterfile_matches')
            .update({
              store_id: masterfileStoreId,
              match_type: 'manual_match',
              // Update all the store fields from the store data
              store_name: storeData.store_name,
              store_company: storeData.store_company,
              address_line_1: storeData.address_line_1 || storeData.address_line,
              eircode: storeData.eircode,
              dispatch_code: storeData.dispatch_code,
              store_code: storeData.store_code,
              door_code: storeData.door_code,
              alarm_code: storeData.alarm_code,
              fridge_code: storeData.fridge_code,
              hour_access_24: storeData.hour_access_24,
              earliest_delivery_time: storeData.earliest_delivery_time
            })
            .eq('store_order_id', orderStoreId)
            .select();
          
          console.log('Updated order matches:', updatedOrderMatches);
        } catch (updateError) {
          console.error('Error updating existing matches in database:', updateError);
          // Continue anyway since we've already saved the main match
        }
      }
      
      return { success: true, data: { match: matchData, store: storeData } };
    } catch (error) {
      console.error('Exception during store match save:', error);
      return { success: false, error };
    }
  }

  // Method to get all manual store matches
  async getManualStoreMatches(): Promise<any[]> {
    console.log('Getting all manual store matches');
    
    if (!this.supabase) {
      console.error('Supabase client is not initialized.');
      return [];
    }

    try {
      const { data, error } = await this.supabase
        .from('store_matches')
        .select('*')
        .order('customer_name');
      
      if (error) {
        console.error('Error fetching manual store matches:', error);
        return [];
      }
      
      console.log(`Retrieved ${data?.length || 0} manual store matches`);
      return data || [];
    } catch (error) {
      console.error('Exception during getManualStoreMatches:', error);
      return [];
    }
  }

  // Get all stores from the database
  async getAllStores(): Promise<any[]> {
    const { data, error } = await this.supabase
      .from('stores')
      .select('*')
      .order('store_name');
      
    if (error) {
      console.error('Error fetching all stores:', error);
      throw error;
    }
    
    return data || [];
  }

  // Search stores by term
  async searchStores(searchTerm: string): Promise<any[]> {
    const term = searchTerm.toLowerCase();
    
    const { data, error } = await this.supabase
      .from('stores')
      .select('*')
      .or(`store_name.ilike.%${term}%,store_code.ilike.%${term}%,dispatch_code.ilike.%${term}%,address_line.ilike.%${term}%,eircode.ilike.%${term}%`)
      .order('store_name');
      
    if (error) {
      console.error('Error searching stores:', error);
      throw error;
    }
    
    return data || [];
  }

  // Update store
  async updateStore(storeId: string, updates: any): Promise<void> {
    // Create a copy of the updates object to avoid modifying the original
    const storeUpdates = { ...updates };
    
    // Remove additionalInfo from updates as it's stored in a separate table
    if ('additionalInfo' in storeUpdates) {
      delete storeUpdates.additionalInfo;
    }
    
    // Remove fields that don't exist in the database schema
    const nonExistentColumns = ['opening_time_sunday', 'opening_time_saturday'];
    nonExistentColumns.forEach(column => {
      if (column in storeUpdates) {
        delete storeUpdates[column];
      }
    });
    
    // Log the update payload for debugging
    console.log('Updating store with payload:', storeUpdates);
    
    // Determine which ID field to use for the where clause
    const idField = storeId.includes('-') ? 'id' : 'store_id';
    console.log(`Using ${idField} for update where clause with value: ${storeId}`);
    
    const { error } = await this.supabase
      .from('stores')
      .update(storeUpdates)
      .eq(idField, storeId);
      
    if (error) {
      console.error('Error updating store:', error);
      throw error;
    }
  }

  // Method to get store information by ID with related data
  async getStoreById(storeId: string): Promise<any | null> {
    if (!this.supabase) {
      console.error('Supabase client is not initialized.');
      return null;
    }

    try {
      console.log(`Getting store information for ID: ${storeId}`);
      
      // Fetch the store record by ID
      const { data, error } = await this.supabase
        .from('stores')
        .select('*')
        .eq('id', storeId)
        .single();
      
      if (error) {
        throw error;
      }
      
      if (!data) {
        return null;
      }
      
      return data;
    } catch (error) {
      console.error('Error fetching store by ID:', error);
      return null;
    }
  }

  // Method to get store additional information
  async getStoreAdditionalInfo(storeId: string): Promise<any[] | null> {
    if (!this.supabase) {
      console.error('Supabase client is not initialized.');
      return null;
    }

    try {
      console.log(`Getting additional info for store ID: ${storeId}`);
      
      const { data, error } = await this.supabase
        .from('store_additional_info')
        .select('*')
        .eq('store_id', storeId)
        .order('created_at', { ascending: false });
      
      if (error) {
        throw error;
      }
      
      return data || [];
    } catch (error) {
      console.error('Error fetching store additional info:', error);
      return null;
    }
  }

  // Method to add additional info for a store
  async addStoreAdditionalInfo(infoData: any): Promise<any> {
    if (!this.supabase) {
      console.error('Supabase client is not initialized.');
      return { error: { message: 'Supabase client is not initialized.' } };
    }

    try {
      console.log('Adding additional info:', infoData);
      
      const { data, error } = await this.supabase
        .from('store_additional_info')
        .insert(infoData);
      
      if (error) {
        throw error;
      }
      
      return { data };
    } catch (error) {
      console.error('Error adding store additional info:', error);
      return { error };
    }
  }

  // Method to get store images
  async getStoreImages(storeId: string): Promise<any[] | null> {
    if (!this.supabase) {
      console.error('Supabase client is not initialized.');
      return null;
    }

    try {
      console.log(`Getting images for store ID: ${storeId}`);
      
      const { data, error } = await this.supabase
        .from('store_images')
        .select('*')
        .eq('store_id', storeId)
        .order('uploaded_at', { ascending: false });
      
      if (error) {
        throw error;
      }
      
      return data || [];
    } catch (error) {
      console.error('Error fetching store images:', error);
      return null;
    }
  }

  // Method to upload a store image
  async uploadStoreImage(imageData: { store_id: string, file: File, is_storefront: string, instructions?: string }): Promise<any> {
    if (!this.supabase) {
      console.error('Supabase client is not initialized.');
      return { error: { message: 'Supabase client is not initialized.' } };
    }

    try {
      const { store_id, file, is_storefront, instructions } = imageData;
      
      // Create a unique file name
      const fileExt = file.name.split('.').pop();
      const fileName = `${Date.now()}-${Math.round(Math.random() * 1E9)}.${fileExt}`;
      const filePath = `stores/${store_id}/${fileName}`;
      
      // Generate a custom image code for database export/import matching
      const imageCode = `IMG_${store_id.substring(0, 8)}_${Date.now().toString(36)}`;
      
      console.log(`Uploading image to ${filePath} with code ${imageCode}`);
      
      // Upload the file to Supabase Storage
      const { data: uploadData, error: uploadError } = await this.supabase.storage
        .from('store-images')
        .upload(filePath, file);
      
      if (uploadError) {
        throw uploadError;
      }
      
      // Get the public URL for the file
      const { data: urlData } = this.supabase.storage
        .from('store-images')
        .getPublicUrl(filePath);
      
      if (!urlData || !urlData.publicUrl) {
        throw new Error('Failed to get public URL for uploaded file');
      }
      
      // Create a database record for the image
      const imageRecord = {
        store_id,
        file_path: filePath,
        url: urlData.publicUrl,
        file_name: fileName,
        is_storefront,
        instructions: instructions || '',
        uploaded_at: new Date().toISOString(),
        created_at: new Date().toISOString()
      };
      
      const { data: dbData, error: dbError } = await this.supabase
        .from('store_images')
        .insert(imageRecord);
      
      if (dbError) {
        throw dbError;
      }
      
      // Get current store images data
      const { data: storeData, error: storeError } = await this.supabase
        .from('stores')
        .select('images')
        .eq('id', store_id)
        .single();
        
      if (storeError) {
        console.error('Error fetching store data:', storeError);
        // Continue with the image upload even if we can't update the store
      } else {
        // Update the store's images column with the new image code
        let updatedImages;
        if (storeData && storeData.images) {
          // If images field exists and has data, append the new code
          try {
            const currentImages = storeData.images ? JSON.parse(storeData.images) : [];
            updatedImages = JSON.stringify([...currentImages, imageCode]);
          } catch (e) {
            // If parsing fails, treat as string and create new array
            updatedImages = JSON.stringify([storeData.images, imageCode]);
          }
        } else {
          // If no images yet, create a new array with just this image code
          updatedImages = JSON.stringify([imageCode]);
        }
        
        const { error: updateError } = await this.supabase
          .from('stores')
          .update({ images: updatedImages })
          .eq('id', store_id);
          
        if (updateError) {
          console.error('Error updating store images field:', updateError);
        }
      }
      
      return { data: dbData, imageCode };
    } catch (error) {
      console.error('Error uploading store image:', error);
      return { error };
    }
  }

  // Method to update a store image (e.g., change annotation or storefront status)
  async updateStoreImage(updates: { id: string, is_storefront?: string, instructions?: string }): Promise<any> {
    if (!this.supabase) {
      console.error('Supabase client is not initialized.');
      return { error: { message: 'Supabase client is not initialized.' } };
    }

    try {
      console.log('Updating store image:', updates);
      
      const { data, error } = await this.supabase
        .from('store_images')
        .update({
          is_storefront: updates.is_storefront,
          instructions: updates.instructions,
          // Don't include undefined values in the update
        })
        .eq('id', updates.id);
      
      if (error) {
        throw error;
      }
      
      return { data };
    } catch (error) {
      console.error('Error updating store image:', error);
      return { error };
    }
  }

  // Method to delete a store image
  async deleteStoreImage(imageId: string): Promise<any> {
    if (!this.supabase) {
      console.error('Supabase client is not initialized.');
      return { error: { message: 'Supabase client is not initialized.' } };
    }

    try {
      console.log(`Deleting image with ID: ${imageId}`);
      
      // First, get the image record to get the file path and store_id
      const { data: imageData, error: getError } = await this.supabase
        .from('store_images')
        .select('file_path, store_id, uploaded_at')
        .eq('id', imageId)
        .single();
      
      if (getError) {
        throw getError;
      }
      
      if (!imageData || !imageData.file_path) {
        throw new Error('Image not found or file path is missing');
      }
      
      // Delete the file from storage
      const { error: storageError } = await this.supabase.storage
        .from('store-images')
        .remove([imageData.file_path]);
      
      if (storageError) {
        console.warn('Error deleting file from storage:', storageError);
        // Continue with deleting the database record even if storage deletion fails
      }
      
      // Before deleting the image record, update the store's images array
      try {
        const storeId = imageData.store_id;
        
        // Generate the image code using the same pattern as in the upload
        const imageCode = `IMG_${storeId.substring(0, 8)}_${new Date(imageData.uploaded_at).getTime().toString(36)}`;
        
        // Get current store images data
        const { data: storeData, error: storeError } = await this.supabase
          .from('stores')
          .select('images')
          .eq('id', storeId)
          .single();
          
        if (storeError) {
          console.error('Error fetching store data:', storeError);
        } else if (storeData && storeData.images) {
          // Update the images array by removing the image code
          try {
            const currentImages = typeof storeData.images === 'string' 
              ? JSON.parse(storeData.images) 
              : storeData.images;
              
            if (Array.isArray(currentImages)) {
              const updatedImages = currentImages.filter(code => code !== imageCode);
              
              const { error: updateError } = await this.supabase
                .from('stores')
                .update({ images: JSON.stringify(updatedImages) })
                .eq('id', storeId);
                
              if (updateError) {
                console.error('Error updating store images field:', updateError);
              } else {
                console.log(`Removed image code ${imageCode} from store ${storeId}`);
              }
            }
          } catch (e) {
            console.error('Error updating store images array:', e);
          }
        }
      } catch (updateError) {
        console.error('Failed to update store images array:', updateError);
        // Continue with deletion even if update fails
      }
      
      // Delete the database record
      const { data, error } = await this.supabase
        .from('store_images')
        .delete()
        .eq('id', imageId);
      
      if (error) {
        throw error;
      }
      
      return { data };
    } catch (error) {
      console.error('Error deleting store image:', error);
      return { error };
    }
  }

  // Method to get route details for a specific store
  async getStoreRouteDetails(storeCode: string, storeName: string): Promise<any | null> {
    if (!storeCode) {
      console.warn('Cannot get route details without a store code');
      return null;
    }

    try {
      console.log(`Getting route details for store: ${storeCode}`);

      // First try to match by store code (more reliable)
      let { data: orderData, error } = await this.supabase
        .from('store_orders')
        .select(`
          id,
          store_code,
          store_name,
          route,
          delivery_date,
          import_id
        `)
        .eq('store_code', storeCode)
        .order('delivery_date', { ascending: false })
        .limit(1);

      // If no results, try to match by store name
      if ((!orderData || orderData.length === 0) && storeName) {
        const { data: nameOrderData, error: nameError } = await this.supabase
          .from('store_orders')
          .select(`
            id,
            store_code,
            store_name,
            route,
            delivery_date,
            import_id
          `)
          .ilike('store_name', `%${storeName}%`)
          .order('delivery_date', { ascending: false })
          .limit(1);

        if (nameError) {
          console.error('Error fetching store orders by name:', nameError);
        } else if (nameOrderData && nameOrderData.length > 0) {
          orderData = nameOrderData;
        }
      }

      if (error) {
        console.error('Error fetching store orders:', error);
        return null;
      }

      if (!orderData || orderData.length === 0) {
        console.log(`No order data found for store: ${storeCode}`);
        return null;
      }

      // Get import details to find route information
      const importId = orderData[0].import_id;
      const { data: importData, error: importError } = await this.supabase
        .from('order_imports')
        .select('*')
        .eq('id', importId)
        .single();

      if (importError) {
        console.error('Error fetching order import:', importError);
        return null;
      }

      // Get all orders for this store to determine last and next delivery dates
      const { data: allStoreOrders, error: allOrdersError } = await this.supabase
        .from('store_orders')
        .select('delivery_date, route')
        .eq('store_code', storeCode)
        .order('delivery_date', { ascending: false })
        .limit(10);

      if (allOrdersError) {
        console.error('Error fetching all store orders:', allOrdersError);
      }

      // Process delivery dates
      let lastDeliveryDate = null;
      let nextDeliveryDate = null;
      
      if (allStoreOrders && allStoreOrders.length > 0) {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        
        // Find last delivery (most recent in the past)
        const pastDeliveries = allStoreOrders
          .filter(order => new Date(order.delivery_date) < today)
          .sort((a, b) => new Date(b.delivery_date).getTime() - new Date(a.delivery_date).getTime());
          
        if (pastDeliveries.length > 0) {
          lastDeliveryDate = pastDeliveries[0].delivery_date;
        }
        
        // Find next delivery (soonest in the future)
        const futureDeliveries = allStoreOrders
          .filter(order => new Date(order.delivery_date) >= today)
          .sort((a, b) => new Date(a.delivery_date).getTime() - new Date(b.delivery_date).getTime());
          
        if (futureDeliveries.length > 0) {
          nextDeliveryDate = futureDeliveries[0].delivery_date;
        }
      }

      // Construct route details object
      const routeDetails = {
        route_name: orderData[0].route,
        route_number: importData?.route || null,
        route_status: 'active', // Default status
        last_delivery_date: lastDeliveryDate,
        next_delivery_date: nextDeliveryDate
      };

      console.log('Retrieved route details:', routeDetails);
      return routeDetails;
    } catch (err) {
      console.error('Exception in getStoreRouteDetails:', err);
      return null;
    }
  }

  // Method to get driver delivery updates history with pagination
  async getDriverDeliveryUpdateHistory(
    driverId: string, 
    page: number = 0,
    pageSize: number = 10
  ): Promise<any> {
    console.log(`Getting driver delivery update history for driver: ${driverId}, page: ${page}`);
    
    try {
      const from = page * pageSize;
      const to = from + pageSize - 1;
      
      const { data, error, count } = await this.supabase
        .from('driver_delivery_updates')
        .select('*', { count: 'exact' })
        .eq('driver_id', driverId)
        .order('created_at', { ascending: false })
        .range(from, to);

      if (error) {
        console.error('Error fetching driver delivery update history:', error);
        return { data: null, count: 0, error };
      }

      console.log(`Retrieved ${data?.length || 0} driver delivery updates (page ${page + 1})`);
      return { data, count, error: null };
    } catch (err) {
      console.error('Exception fetching driver delivery update history:', err);
      return { data: null, count: 0, error: err };
    }
  }

  // Method to get a specific driver delivery update by ID
  async getDriverDeliveryUpdateById(updateId: string): Promise<any> {
    console.log(`Getting driver delivery update by ID: ${updateId}`);
    
    try {
      const { data, error } = await this.supabase
        .from('driver_delivery_updates')
        .select('*')
        .eq('id', updateId)
        .single();

      if (error) {
        console.error('Error fetching driver delivery update:', error);
        return { data: null, error };
      }

      console.log('Retrieved driver delivery update');
      return { data, error: null };
    } catch (err) {
      console.error('Exception fetching driver delivery update:', err);
      return { data: null, error: err };
    }
  }

  // Staff Roster Management Methods
  
  // Method to upload a file to Supabase storage
  async uploadFile(bucket: string, fileName: string, file: File): Promise<{ success: boolean; data?: any; error?: string }> {
    try {
      console.log(`Uploading file ${fileName} to bucket ${bucket}`);
      
      const { data, error } = await this.supabase.storage
        .from(bucket)
        .upload(fileName, file, {
          cacheControl: '3600',
          upsert: false
        });

      if (error) {
        console.error('Error uploading file:', error);
        return { success: false, error: error.message };
      }

      console.log('File uploaded successfully:', data);
      return { success: true, data };
    } catch (err) {
      console.error('Exception uploading file:', err);
      return { success: false, error: err instanceof Error ? err.message : 'Unknown error' };
    }
  }

  // Method to get public URL for a file
  getPublicUrl(bucket: string, fileName: string): string {
    const { data } = this.supabase.storage
      .from(bucket)
      .getPublicUrl(fileName);
    
    return data.publicUrl;
  }

  // Method to get image URL for different types of images
  getImageUrl(imagePath: string): string {
    if (!imagePath) return '';
    
    // If the path already includes the bucket name (e.g., "van-issues/123_456_0.jpg")
    if (imagePath.includes('/')) {
      const parts = imagePath.split('/');
      const bucket = parts[0];
      const fileName = parts.slice(1).join('/');
      return this.getPublicUrl(bucket, fileName);
    }
    
    // Check if this is a van issue image based on filename pattern
    // Van issue images typically follow pattern: driverId_timestamp_index.extension
    if (imagePath.match(/^\d+_\d+_\d+\./)) {
      return this.getVanIssueImageUrl(imagePath);
    }
    
    // Check if this is a van issue image by checking if it's in a format that would be from van issues
    // This includes checking for timestamp-like patterns
    if (imagePath.match(/^\d+_\d{13}_\d+\./)) {
      return this.getVanIssueImageUrl(imagePath);
    }
    
    // Check for any pattern that looks like it could be a van issue (more lenient)
    if (imagePath.match(/\d+_\d+_\d+\.(jpg|jpeg|png|gif|webp)$/i)) {
      return this.getVanIssueImageUrl(imagePath);
    }
    
    // Default to vehicle-crash bucket for backward compatibility
    return this.getPublicUrl('vehicle-crash', imagePath);
  }

  // Specific method for van issue images
  getVanIssueImageUrl(imagePath: string): string {
    if (!imagePath) return '';
    
    // For van issue images, always use the van-issues bucket
    return this.getPublicUrl('van-issues', imagePath);
  }

  // Method to delete a file from storage
  async deleteFile(bucket: string, fileName: string): Promise<{ success: boolean; error?: string }> {
    try {
      console.log(`Deleting file ${fileName} from bucket ${bucket}`);
      
      const { error } = await this.supabase.storage
        .from(bucket)
        .remove([fileName]);

      if (error) {
        console.error('Error deleting file:', error);
        return { success: false, error: error.message };
      }

      console.log('File deleted successfully');
      return { success: true };
    } catch (err) {
      console.error('Exception deleting file:', err);
      return { success: false, error: err instanceof Error ? err.message : 'Unknown error' };
    }
  }

  // Method to save staff roster data to database
  async saveStaffRoster(rosterData: any): Promise<{ success: boolean; data?: any; error?: string }> {
    try {
      console.log('Saving staff roster data:', rosterData);
      
      const { data, error } = await this.supabase
        .from('staff_rosters')
        .insert([{
          ...rosterData,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        }])
        .select()
        .single();

      if (error) {
        console.error('Error saving staff roster:', error);
        return { success: false, error: error.message };
      }

      console.log('Staff roster saved successfully:', data);
      return { success: true, data };
    } catch (err) {
      console.error('Exception saving staff roster:', err);
      return { success: false, error: err instanceof Error ? err.message : 'Unknown error' };
    }
  }

  // Method to get all staff rosters
  async getStaffRosters(): Promise<{ success: boolean; data?: any[]; error?: string }> {
    try {
      console.log('Fetching staff rosters');
      
      const { data, error } = await this.supabase
        .from('staff_rosters')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error fetching staff rosters:', error);
        return { success: false, error: error.message };
      }

      console.log(`Retrieved ${data?.length || 0} staff rosters`);
      return { success: true, data: data || [] };
    } catch (err) {
      console.error('Exception fetching staff rosters:', err);
      return { success: false, error: err instanceof Error ? err.message : 'Unknown error' };
    }
  }

  // Method to delete a staff roster
  async deleteStaffRoster(rosterId: number): Promise<{ success: boolean; error?: string }> {
    try {
      console.log(`Deleting staff roster with ID: ${rosterId}`);
      
      const { error } = await this.supabase
        .from('staff_rosters')
        .delete()
        .eq('id', rosterId);

      if (error) {
        console.error('Error deleting staff roster:', error);
        return { success: false, error: error.message };
      }

      console.log('Staff roster deleted successfully');
      return { success: true };
    } catch (err) {
      console.error('Exception deleting staff roster:', err);
      return { success: false, error: err instanceof Error ? err.message : 'Unknown error' };
    }
  }

  // Accident Reports Methods
  async getAccidentReports(): Promise<any[]> {
    try {
      const { data, error } = await this.supabase
        .from('accident_reports')
        .select(`
          *,
          accident_report_images (
            id,
            image_path,
            filename,
            uploaded_at
          )
        `)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error fetching accident reports:', error);
        return [];
      }

      return data || [];
    } catch (err) {
      console.error('Exception fetching accident reports:', err);
      return [];
    }
  }

  async getAccidentReportById(reportId: string): Promise<any | null> {
    try {
      const { data, error } = await this.supabase
        .from('accident_reports')
        .select(`
          *,
          accident_report_images (
            id,
            image_path,
            filename,
            uploaded_at
          )
        `)
        .eq('id', reportId)
        .single();

      if (error) {
        console.error('Error fetching accident report:', error);
        return null;
      }

      return data;
    } catch (err) {
      console.error('Exception fetching accident report:', err);
      return null;
    }
  }

  // Method to get all rejected orders for admin reports
  async getAllRejectedOrders() {
    console.log('Fetching all rejected orders for admin');
    
    try {
      const { data, error } = await this.supabase
        .from('rejected_orders')
        .select(`
          *,
          drivers (
            name,
            custom_id,
            phone_number
          )
        `)
        .order('created_at', { ascending: false });
      
      if (error) {
        console.error('Error fetching rejected orders:', error);
        throw error;
      }
      
      console.log(`Retrieved ${data?.length || 0} rejected orders`);
      return data || [];
    } catch (err) {
      console.error('Exception during rejected orders fetch:', err);
      throw err;
    }
  }

  // Method to get rejected orders by date range
  async getRejectedOrdersByDateRange(startDate: string, endDate: string) {
    console.log(`Fetching rejected orders from ${startDate} to ${endDate}`);
    
    try {
      const { data, error } = await this.supabase
        .from('rejected_orders')
        .select(`
          *,
          drivers (
            name,
            custom_id,
            phone_number
          )
        `)
        .gte('date', startDate)
        .lte('date', endDate)
        .order('created_at', { ascending: false });
      
      if (error) {
        console.error('Error fetching rejected orders by date range:', error);
        throw error;
      }
      
      console.log(`Retrieved ${data?.length || 0} rejected orders for date range`);
      return data || [];
    } catch (err) {
      console.error('Exception during rejected orders date range fetch:', err);
      throw err;
    }
  }

  // Method to get rejected orders by driver
  async getRejectedOrdersByDriver(driverId: string) {
    console.log(`Fetching rejected orders for driver: ${driverId}`);
    
    try {
      const { data, error } = await this.supabase
        .from('rejected_orders')
        .select(`
          *,
          drivers (
            name,
            custom_id,
            phone_number,
          )
        `)
        .eq('driver_id', driverId)
        .order('created_at', { ascending: false });
      
      if (error) {
        console.error('Error fetching rejected orders by driver:', error);
        throw error;
      }
      
      console.log(`Retrieved ${data?.length || 0} rejected orders for driver`);
      return data || [];
    } catch (err) {
      console.error('Exception during rejected orders driver fetch:', err);
      throw err;
    }
  }

//method tpo get all tempertures from the form 
  async getAllTemperatureReports() {
    console.log('Fetching all temperature issue reports for admin');
    
    try {
      const { data, error } = await this.supabase
        .from('rejected_order_temp_forms')
        .select('*')
        .order('created_at', { ascending: false });
      
      if (error) {
        console.error('Error fetching temperature reports:', error);
        throw error;
      }
      
      console.log(`Retrieved ${data?.length || 0} temperature reports`);
      return data || [];
    } catch (err) {
      console.error('Exception during temperature reports fetch:', err);
      throw err;
    }
  }
}
