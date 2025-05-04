import { Injectable } from '@angular/core';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { environment } from '../../environments/environment.development'; // Use development for now

@Injectable({
  providedIn: 'root'
})
export class SupabaseService {
  private supabase: SupabaseClient;

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
      
      // If the form includes crate data, insert into the crate_tracking table
      if (numberOfCratesOut > 0 || numberOfCratesIn > 0) {
        try {
          let driverId = formData.driver_id;
          
          // If we don't have a driver_id but we have a driver name, try to find the driver
          if (!driverId && submissionData.driver_name) {
            const { data: driverData } = await this.supabase
              .from('drivers')
              .select('id')
              .eq('name', submissionData.driver_name)
              .maybeSingle();
            
            if (driverData) {
              driverId = driverData.id;
            }
          }
          
          // Create new crate tracking entry
          console.log('Creating new crate tracking entry with data:', {
            date: dateValue,
            driver_id: driverId,
            vehicle_id: formData.van_registration || formData.vanRegistration || '',
            cratesOut: numberOfCratesOut,
            cratesIn: numberOfCratesIn
          });
          
          const { error: insertError } = await this.supabase
            .from('crate_tracking')
            .insert([{
              date: dateValue || this.formatDate(new Date()),
              driver_id: driverId || null,
              vehicle_id: formData.van_registration || formData.vanRegistration || '',
              "cratesOut": numberOfCratesOut,
              "cratesIn": numberOfCratesIn,
              notes: `From driver: ${formData.driverName || formData.driver_name || 'Unknown'}`
            }]);
            
          if (insertError) {
            console.error('Error inserting crate tracking data:', insertError);
          } else {
            console.log('Crate tracking data inserted successfully');
          }
        } catch (err) {
          console.error('Error handling crate data:', err);
        }
      }
      
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

  // Method to get crate tracking data
  async getCrateTrackingData() {
    console.log('Getting real crate tracking data from database');
    
    try {
      const { data, error } = await this.supabase
        .from('crate_tracking')
        .select(`
          *,
          drivers:driver_id (name)
        `)
        .order('date', { ascending: true });

      if (error) {
        console.error('Error fetching crate tracking data:', error);
        return { data: null, error };
      }

      // Transform data to include driver name directly
      const transformedData = data.map(item => {
        return {
          ...item,
          driver_name: item.drivers?.name || (item.notes ? item.notes.replace('From driver: ', '').replace('Migrated from driver forms: ', '') : 'Unknown')
        };
      });

      console.log(`Retrieved ${transformedData?.length || 0} real crate tracking records from database`);
      return { data: transformedData, error: null };
    } catch (err) {
      console.error('Exception during crate tracking data fetch:', err);
      return { data: [], error: err };
    }
  }

  // Method to migrate existing driver form crate data to the crate_tracking table
  async migrateCrateDataFromDriverForms() {
    console.log('Starting migration of crate data from driver forms');
    
    // Fetch all driver forms with crate data
    const { data: forms, error: fetchError } = await this.supabase
      .from('driver_forms')
      .select('id, driver_name, date, van_registration, number_of_crates_out, number_of_crates_in')
      .or('number_of_crates_out.gt.0,number_of_crates_in.gt.0');
      
    if (fetchError) {
      console.error('Error fetching driver forms with crate data:', fetchError);
      return { success: false, error: fetchError };
    }
    
    console.log(`Found ${forms?.length || 0} driver forms with crate data to migrate`);
    
    // First, get all drivers to map names to IDs
    const { data: drivers } = await this.supabase
      .from('drivers')
      .select('id, name');
    
    const driverMap = new Map();
    if (drivers) {
      drivers.forEach(driver => {
        driverMap.set(driver.name.toLowerCase(), driver.id);
      });
    }
    
    // Process each form individually to ensure accuracy
    let successCount = 0;
    let errorCount = 0;
    
    for (const form of forms || []) {
      if (!form.date) continue;
      
      const driverName = form.driver_name || 'Unknown';
      const driverId = driverMap.get(driverName.toLowerCase()) || null;
      const cratesOut = parseInt(form.number_of_crates_out) || 0;
      const cratesIn = parseInt(form.number_of_crates_in) || 0;
      
      if (cratesOut === 0 && cratesIn === 0) {
        console.log(`No crate data for driver ${driverName} on form ${form.id}, skipping`);
        continue;
      }
      
      console.log(`Processing form ${form.id} for driver ${driverName} with ${cratesOut} crates out and ${cratesIn} crates in`);
      
      try {
        // Create new entry
        console.log(`Creating new crate tracking entry for driver ${driverName} on date ${form.date}`);
        const { error: insertError } = await this.supabase
          .from('crate_tracking')
          .insert([{
            date: form.date,
            driver_id: driverId,
            vehicle_id: form.van_registration || '',
            "cratesOut": cratesOut,
            "cratesIn": cratesIn,
            notes: `From driver form: ${driverName}`
          }]);
          
        if (insertError) {
          console.error(`Error inserting crate tracking data for form ${form.id}:`, insertError);
          errorCount++;
        } else {
          console.log(`Successfully inserted crate tracking data for driver ${driverName} on date ${form.date}`);
          successCount++;
        }
      } catch (err) {
        console.error(`Exception during crate tracking insert for form ${form.id}:`, err);
        errorCount++;
      }
    }
    
    console.log(`Migration complete. Success: ${successCount}, Errors: ${errorCount}`);
    return { 
      success: errorCount === 0, 
      processed: successCount + errorCount,
      succeeded: successCount,
      failed: errorCount
    };
  }

  // Method to fix any issues with crate tracking column names
  async fixCrateColumnNames() {
    console.log('Attempting to fix crate tracking column names...');
    
    try {
      // First, clear out any existing crate_tracking data
      const { error: deleteError } = await this.supabase
        .from('crate_tracking')
        .delete()
        .not('id', 'is', null);
        
      if (deleteError) {
        console.error('Error deleting existing crate tracking data:', deleteError);
      } else {
        console.log('Successfully cleared existing crate tracking data');
      }

      // Get all driver forms with crate data
      const { data: forms, error: fetchError } = await this.supabase
        .from('driver_forms')
        .select('id, driver_name, date, van_registration, number_of_crates_out, number_of_crates_in')
        .or('number_of_crates_out.gt.0,number_of_crates_in.gt.0');
        
      if (fetchError) {
        console.error('Error fetching forms with crate data:', fetchError);
        return false;
      }
      
      console.log(`Found ${forms?.length || 0} forms with crate data to migrate`);
      
      // Get all drivers to map names to IDs
      const { data: drivers } = await this.supabase
        .from('drivers')
        .select('id, name');
      
      const driverMap = new Map();
      if (drivers) {
        drivers.forEach(driver => {
          driverMap.set(driver.name?.toLowerCase(), driver.id);
        });
      }
      
      // Create direct insertions for each form
      let successCount = 0;
      let errorCount = 0;
      
      // Create batch for insertion
      const batchData = [];
      
      for (const form of forms || []) {
        if (!form.date) continue;
        
        const driverName = form.driver_name || 'Unknown';
        const driverId = driverMap.get(driverName.toLowerCase()) || null;
        const cratesOut = parseInt(form.number_of_crates_out) || 0;
        const cratesIn = parseInt(form.number_of_crates_in) || 0;
        
        if (cratesOut === 0 && cratesIn === 0) continue;
        
        batchData.push({
          date: form.date,
          driver_id: driverId,
          vehicle_id: form.van_registration || '',
          cratesOut: cratesOut,
          cratesIn: cratesIn,
          notes: `Migrated from driver form: ${driverName}`,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        });
      }
      
      // Insert in batch
      if (batchData.length > 0) {
        console.log(`Inserting batch of ${batchData.length} crate tracking records`);
        
        const { data, error } = await this.supabase
          .from('crate_tracking')
          .insert(batchData);
          
        if (error) {
          console.error('Error inserting batch crate tracking data:', error);
          errorCount = batchData.length;
        } else {
          console.log('Successfully inserted batch crate tracking data');
          successCount = batchData.length;
        }
      }
      
      console.log(`Crate data fix complete. Success: ${successCount}, Errors: ${errorCount}`);
      return successCount > 0;
    } catch (err) {
      console.error('Error fixing crate tracking data:', err);
      return false;
    }
  }

  // Method to directly update crate_tracking with values from driver_forms
  async copyAllCrateDataFromDriverForms() {
    console.log('Starting direct copy of ALL crate data from driver_forms table');
    
    try {
      // Get all driver forms with crate data (specifically looking at number_of_crates_in)
      const { data: forms, error: fetchError } = await this.supabase
        .from('driver_forms')
        .select('id, driver_name, date, van_registration, number_of_crates_out, number_of_crates_in')
        .or('number_of_crates_out.gt.0,number_of_crates_in.gt.0');
        
      if (fetchError) {
        console.error('Error fetching forms with crate data:', fetchError);
        return { success: false, error: fetchError };
      }
      
      console.log(`Found ${forms?.length || 0} driver forms with crate data to directly copy`);
      
      // First, get all drivers to map names to IDs
      const { data: drivers } = await this.supabase
        .from('drivers')
        .select('id, name');
      
      const driverMap = new Map();
      if (drivers) {
        drivers.forEach(driver => {
          driverMap.set(driver.name?.toLowerCase(), driver.id);
        });
      }
      
      // Create batch for insertion
      const batchData = [];
      
      for (const form of forms || []) {
        if (!form.date) continue;
        
        const driverName = form.driver_name || 'Unknown';
        const driverId = driverMap.get(driverName?.toLowerCase()) || null;
        
        // Explicitly convert to number and use 0 if NaN
        const cratesOut = Number(form.number_of_crates_out) || 0;
        const cratesIn = Number(form.number_of_crates_in) || 0;
        
        console.log(`Processing form data: Driver=${driverName}, Date=${form.date}, CratesOut=${cratesOut}, CratesIn=${cratesIn}`);
        
        if (cratesOut === 0 && cratesIn === 0) {
          console.log(`No crate data for driver ${driverName} on form ${form.id}, skipping`);
          continue;
        }
        
        batchData.push({
          date: form.date,
          driver_id: driverId,
          vehicle_id: form.van_registration || '',
          cratesOut: cratesOut,
          cratesIn: cratesIn,
          notes: `Direct copy from driver_form: ${driverName}`,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        });
      }
      
      // Insert in batch
      if (batchData.length > 0) {
        console.log(`Inserting batch of ${batchData.length} crate tracking records directly`);
        console.log('Sample data being inserted:', batchData.slice(0, 2));
        
        const { data, error } = await this.supabase
          .from('crate_tracking')
          .insert(batchData);
          
        if (error) {
          console.error('Error inserting direct crate tracking data:', error);
          return { success: false, error: error };
        } else {
          console.log('Successfully inserted direct crate tracking data');
          return { success: true, count: batchData.length };
        }
      } else {
        console.log('No valid crate data found to copy');
        return { success: false, error: 'No valid crate data found' };
      }
    } catch (err) {
      console.error('Error in direct crate data copy:', err);
      return { success: false, error: err };
    }
  }
}
