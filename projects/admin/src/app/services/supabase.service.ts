import { Injectable } from '@angular/core';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { environment } from '../../environments/environment';

@Injectable({
  providedIn: 'root'
})
export class SupabaseService {
  public client: SupabaseClient;
  
  constructor() {
    console.log('SupabaseService: Initializing with URL:', environment.supabaseUrl);
    console.log('SupabaseService: Key starts with:', environment.supabaseKey.substring(0, 20) + '...');
    
    this.client = createClient(
      environment.supabaseUrl,
      environment.supabaseKey
    );
    
    // Test the connection
    this.testConnection();
  }
  
  /**
   * Test the Supabase connection
   */
  private async testConnection() {
    try {
      console.log('SupabaseService: Testing connection to stores table...');
      
      // Simple query to check if the connection works - don't use aggregate functions
      const { data, error } = await this.client
        .from('stores')
        .select('*')
        .limit(1);
        
      if (error) {
        console.error('SupabaseService: Connection test failed:', error);
      } else {
        const count = data ? data.length : 0;
        console.log(`SupabaseService: Connection test successful. Found ${count} sample records.`);
        
        if (data && data.length > 0) {
          console.log('SupabaseService: Sample store data:', data[0]);
        } else {
          console.log('SupabaseService: No store data found in the table');
        }
      }
    } catch (error) {
      console.error('SupabaseService: Connection test exception:', error);
    }
  }
  
  /**
   * Save imported order data to the database
   * @param data The order data to save
   * @returns Promise with result of the save operation
   */
  async saveImportedOrderData(data: any) {
    try {
      const { data: result, error } = await this.client.rpc('import_parsed_order_data', { p_parsed_data: data });
      
      if (error) {
        return { success: false, error };
      }
      
      return { success: true, data: result };
    } catch (error) {
      console.error('Error saving import:', error);
      return { success: false, error };
    }
  }
  
  /**
   * Execute raw SQL against the database
   * @param sql The SQL to execute
   * @returns Promise with result of the SQL execution
   */
  async executeRawSql(sql: string) {
    return await this.client.rpc('execute_raw_sql', { sql });
  }

  /**
   * Get all custom route exports
   * @returns Promise with all custom route exports
   */
  async getAllCustomRouteExports(): Promise<any[]> {
    try {
      const { data, error } = await this.client
        .from('custom_route_exports')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error getting custom route exports:', error);
        return [];
      }

      return data || [];
    } catch (error) {
      console.error('Exception getting custom route exports:', error);
      return [];
    }
  }

  /**
   * Get custom route exports by name
   * @param exportName The export name to get
   * @returns Promise with custom route exports for the specified name
   */
  async getCustomRouteExports(exportName: string): Promise<any[]> {
    try {
      const { data, error } = await this.client
        .from('custom_route_exports')
        .select('*')
        .eq('export_name', exportName)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error getting custom route exports:', error);
        return [];
      }

      return data || [];
    } catch (error) {
      console.error('Exception getting custom route exports:', error);
      return [];
    }
  }

  /**
   * Delete custom route exports by name
   * @param exportName The export name to delete
   * @returns Promise with boolean result of the operation
   */
  async deleteCustomRouteExports(exportName: string): Promise<boolean> {
    try {
      const { error } = await this.client
        .from('custom_route_exports')
        .delete()
        .eq('export_name', exportName);

      if (error) {
        console.error('Error deleting custom route exports:', error);
        return false;
      }

      return true;
    } catch (error) {
      console.error('Exception deleting custom route exports:', error);
      return false;
    }
  }

  /**
   * Get all imported orders
   * @returns Promise with all imported orders
   */
  async getAllImportedOrders() {
    try {
      const { data, error } = await this.client
        .from('order_imports')
        .select('*, routes(*)')
        .order('imported_at', { ascending: false });

      if (error) {
        console.error('Error getting imported orders:', error);
        return [];
      }

      return data || [];
    } catch (error) {
      console.error('Exception getting imported orders:', error);
      return [];
    }
  }

  /**
   * Process masterfile matches for an import
   * @param importId The import ID to process
   * @returns Promise with result of the operation
   */
  async processMasterfileMatches(importId: number) {
    try {
      const { data, error } = await this.client.rpc(
        'process_store_orders_masterfile_matches',
        { target_import_id: importId }
      );

      if (error) {
        return { success: false, error };
      }

      return { success: true, data };
    } catch (error) {
      console.error('Error processing masterfile matches:', error);
      return { success: false, error };
    }
  }

  /**
   * Get store information
   * @returns Promise with store information
   */
  async getStoreInformation(): Promise<any[]> {
    try {
      // Get the total count first
      const { count, error: countError } = await this.client
        .from('stores')
        .select('*', { count: 'exact', head: true });

      if (countError) {
        console.error('Error getting store count:', countError);
        return [];
      }

      console.log(`Total stores in database: ${count || 0}`);
      
      if (!count) return [];
      
      // Fetch all stores using pagination to get around the 1000 record limit
      const pageSize = 1000;
      const allStores: any[] = [];
      const totalPages = Math.ceil(count / pageSize);
      
      for (let page = 0; page < totalPages; page++) {
        const startIndex = page * pageSize;
        const endIndex = Math.min((page + 1) * pageSize - 1, count - 1);
        
        console.log(`Fetching page ${page + 1}/${totalPages} (records ${startIndex}-${endIndex})`);
        
        const { data, error } = await this.client
          .from('stores')
          .select('*')
          .order('store_name')
          .range(startIndex, endIndex);
          
        if (error) {
          console.error(`Error fetching page ${page + 1}:`, error);
          continue;
        }
        
        if (data && data.length > 0) {
          allStores.push(...data);
          console.log(`Fetched ${data.length} records from page ${page + 1}`);
        }
      }

      console.log(`Retrieved ${allStores.length} store records total`);
      return allStores;
    } catch (error) {
      console.error('Exception getting store information:', error);
      return [];
    }
  }

  /**
   * Get manual store matches
   * @returns Promise with manual store matches
   */
  async getManualStoreMatches(): Promise<any[]> {
    try {
      const { data, error } = await this.client
        .from('store_matches')
        .select('*, stores:masterfile_store_id(*)');

      if (error) {
        console.error('Error getting manual store matches:', error);
        return [];
      }

      return data || [];
    } catch (error) {
      console.error('Exception getting manual store matches:', error);
      return [];
    }
  }

  /**
   * Save manual store match
   * @param orderStoreId The order store ID
   * @param masterfileStoreId The masterfile store ID
   * @param customerName The customer name
   * @param customerCode The customer code
   * @returns Promise with result of the operation
   */
  async saveManualStoreMatch(
    orderStoreId: string, 
    masterfileStoreId: string, 
    customerName: string, 
    customerCode: string
  ) {
    try {
      const { data, error } = await this.client
        .from('store_matches')
        .upsert({
          customer_name: customerName,
          customer_code: customerCode,
          masterfile_store_id: masterfileStoreId,
          last_updated: new Date().toISOString()
        }, {
          onConflict: 'customer_name,customer_code'
        })
        .select();

      if (error) {
        return { success: false, error };
      }

      return { success: true, data };
    } catch (error) {
      console.error('Error saving manual store match:', error);
      return { success: false, error };
    }
  }

  /**
   * Export routes to custom table
   * @param exportName The export name
   * @param orderId The order ID
   * @param routeIds The route IDs to export
   * @returns Promise with result of the operation
   */
  async exportRoutesToCustomTable(exportName: string, orderId: number, routeIds: number[]) {
    try {
      const { data, error } = await this.client.rpc(
        'export_routes_to_custom_table',
        { 
          p_export_name: exportName,
          p_order_id: orderId,
          p_route_ids: routeIds,
          p_created_by: 'system'
        }
      );

      if (error) {
        return { success: false, error };
      }

      return { success: true, data };
    } catch (error) {
      console.error('Error exporting routes to custom table:', error);
      return { success: false, error };
    }
  }

  /**
   * Get all route exports
   * @returns Promise with all route exports
   */
  async getAllRouteExports(): Promise<any[]> {
    try {
      const { data, error } = await this.client
        .from('route_exports')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error getting route exports:', error);
        return [];
      }

      return data || [];
    } catch (error) {
      console.error('Exception getting route exports:', error);
      return [];
    }
  }

  /**
   * Delete route exports by name
   * @param exportName The export name to delete
   * @returns Promise with boolean result of the operation
   */
  async deleteRouteExportsByName(exportName: string): Promise<boolean> {
    try {
      const { error } = await this.client
        .from('route_exports')
        .delete()
        .eq('export_name', exportName);

      if (error) {
        console.error('Error deleting route exports:', error);
        return false;
      }

      return true;
    } catch (error) {
      console.error('Exception deleting route exports:', error);
      return false;
    }
  }

  /**
   * Save matched stores to table
   * @param records The records to save
   * @returns Promise with result of the operation
   */
  async saveMatchedStoresToTable(records: any[]) {
    try {
      const { data, error } = await this.client
        .from('store_orders_masterfile_matches')
        .upsert(records, {
          onConflict: 'store_order_id'
        });

      if (error) {
        return { success: false, error };
      }

      return { success: true, data };
    } catch (error) {
      console.error('Error saving matched stores to table:', error);
      return { success: false, error };
    }
  }

  /**
   * Get all drivers
   */
  async getAllDrivers(): Promise<any[]> {
    try {
      const { data, error } = await this.client
        .from('drivers')
        .select('*')
        .order('name');
        
      if (error) {
        console.error('Error getting drivers:', error);
        return [];
      }
      
      return data || [];
    } catch (error) {
      console.error('Exception getting drivers:', error);
      return [];
    }
  }
  
  /**
   * Add a new driver
   */
  async addDriver(
    name: string, 
    customId: string, 
    role: string = 'driver', 
    location: string = 'Dublin',
    phoneNumber?: string
  ): Promise<any> {
    try {
      const driverData = {
        name,
        custom_id: customId,
        role,
        location,
        phone_number: phoneNumber
      };
      
      const { data, error } = await this.client
        .from('drivers')
        .insert(driverData)
        .select();
        
      if (error) {
        console.error('Error adding driver:', error);
        return { success: false, error };
      }
      
      return { success: true, data };
    } catch (error) {
      console.error('Exception adding driver:', error);
      return { success: false, error };
    }
  }
  
  /**
   * Delete a driver
   */
  async deleteDriver(driverId: string): Promise<boolean> {
    try {
      const { error } = await this.client
        .from('drivers')
        .delete()
        .eq('id', driverId);
        
      if (error) {
        console.error('Error deleting driver:', error);
        return false;
      }
      
      return true;
    } catch (error) {
      console.error('Exception deleting driver:', error);
      return false;
    }
  }
  
  /**
   * Get all form assignments for a specific driver
   */
  async getDriverFormAssignments(driverId: string): Promise<any[]> {
    try {
      const { data, error } = await this.client
        .from('driver_form_assignments')
        .select('*, form_templates(*)')
        .eq('driver_id', driverId)
        .order('due_date', { ascending: false });
        
      if (error) {
        console.error('Error getting driver form assignments:', error);
        return [];
      }
      
      return data || [];
    } catch (error) {
      console.error('Exception getting driver form assignments:', error);
      return [];
    }
  }
  
  /**
   * Get all form assignments
   */
  async getAllFormAssignments(): Promise<any[]> {
    try {
      const { data, error } = await this.client
        .from('driver_form_assignments')
        .select('*, form_templates(*), drivers(*)')
        .order('due_date', { ascending: false });
        
      if (error) {
        console.error('Error getting all form assignments:', error);
        return [];
      }
      
      return data || [];
    } catch (error) {
      console.error('Exception getting all form assignments:', error);
      return [];
    }
  }
  
  /**
   * Get form assignment by id
   */
  async getFormAssignmentById(assignmentId: string): Promise<any> {
    try {
      const { data, error } = await this.client
        .from('driver_form_assignments')
        .select('*, form_templates(*), drivers(*)')
        .eq('id', assignmentId)
        .single();
        
      if (error) {
        console.error('Error getting form assignment:', error);
        return null;
      }
      
      return data;
    } catch (error) {
      console.error('Exception getting form assignment:', error);
      return null;
    }
  }
  
  /**
   * Assign form to driver
   */
  async assignFormToDriver(driverId: string, templateId: string | null, notes: string, dueDate: string): Promise<any> {
    try {
      const formData = {
        driver_id: driverId,
        form_template_id: templateId,
        notes: notes,
        due_date: dueDate,
        status: 'pending'
      };
      
      const { data, error } = await this.client
        .from('driver_form_assignments')
        .insert(formData)
        .select();
        
      if (error) {
        console.error('Error assigning form to driver:', error);
        return { success: false, error };
      }
      
      return { success: true, data };
    } catch (error) {
      console.error('Exception assigning form to driver:', error);
      return { success: false, error };
    }
  }
  
  /**
   * Update form assignment status
   */
  async updateFormAssignmentStatus(assignmentId: string, status: string, formId?: string): Promise<any> {
    try {
      const updateData: any = { status };
      
      // If a form ID is provided, update the form_id field as well
      if (formId) {
        updateData.form_id = formId;
      }
      
      const { data, error } = await this.client
        .from('driver_form_assignments')
        .update(updateData)
        .eq('id', assignmentId)
        .select();
        
      if (error) {
        console.error('Error updating form assignment status:', error);
        return { success: false, error };
      }
      
      return { success: true, data };
    } catch (error) {
      console.error('Exception updating form assignment status:', error);
      return { success: false, error };
    }
  }
  
  /**
   * Delete form assignment
   */
  async deleteFormAssignment(assignmentId: string): Promise<boolean> {
    try {
      const { error } = await this.client
        .from('driver_form_assignments')
        .delete()
        .eq('id', assignmentId);
        
      if (error) {
        console.error('Error deleting form assignment:', error);
        return false;
      }
      
      return true;
    } catch (error) {
      console.error('Exception deleting form assignment:', error);
      return false;
    }
  }
  
  /**
   * Submit driver form
   */
  async submitDriverForm(formData: any): Promise<any> {
    try {
      const { data, error } = await this.client
        .from('driver_forms')
        .insert(formData)
        .select();
        
      if (error) {
        console.error('Error submitting driver form:', error);
        return { success: false, error };
      }
      
      return { success: true, data: data[0] };
    } catch (error) {
      console.error('Exception submitting driver form:', error);
      return { success: false, error };
    }
  }
  
  /**
   * Get driver form by id
   */
  async getDriverFormById(formId: string): Promise<any> {
    try {
      const { data, error } = await this.client
        .from('driver_forms')
        .select('*')
        .eq('id', formId)
        .single();
        
      if (error) {
        console.error('Error getting driver form:', error);
        return null;
      }
      
      return data;
    } catch (error) {
      console.error('Exception getting driver form:', error);
      return null;
    }
  }
  
  /**
   * Save partial form data for later completion
   */
  async savePartialFormData(assignmentId: string, formData: any): Promise<any> {
    try {
      const { data, error } = await this.client
        .from('driver_form_assignments')
        .update({
          partial_form_data: formData,
          partially_completed: true
        })
        .eq('id', assignmentId)
        .select();
        
      if (error) {
        console.error('Error saving partial form data:', error);
        return { success: false, error };
      }
      
      return { success: true, data };
    } catch (error) {
      console.error('Exception saving partial form data:', error);
      return { success: false, error };
    }
  }
  
  /**
   * Update form needs review flag
   */
  async updateFormNeedsReview(formId: string, needsReview: boolean): Promise<boolean> {
    try {
      const { error } = await this.client
        .from('driver_forms')
        .update({ needs_review: needsReview })
        .eq('id', formId);
        
      if (error) {
        console.error('Error updating form needs review:', error);
        return false;
      }
      
      return true;
    } catch (error) {
      console.error('Exception updating form needs review:', error);
      return false;
    }
  }
  
  /**
   * Get driver forms by date range
   */
  async getDriverFormsByDateRange(startDate: string, endDate: string): Promise<any[]> {
    try {
      const { data, error } = await this.client
        .from('driver_forms')
        .select('*')
        .gte('date', startDate)
        .lte('date', endDate)
        .order('date', { ascending: false });
        
      if (error) {
        console.error('Error getting driver forms by date range:', error);
        return [];
      }
      
      return data || [];
    } catch (error) {
      console.error('Exception getting driver forms by date range:', error);
      return [];
    }
  }
  
  /**
   * Get total store count
   */
  getTotalStoreCount(): number | null {
    // Return null and let the calling code use the length of the data array
    return null;
  }
  
  /**
   * Update store information
   */
  async updateStoreInformation(storeData: any): Promise<any> {
    try {
      const { data, error } = await this.client
        .from('stores')
        .upsert(storeData)
        .select();
        
      if (error) {
        console.error('Error updating store information:', error);
        return { success: false, error };
      }
      
      return { success: true, data };
    } catch (error) {
      console.error('Exception updating store information:', error);
      return { success: false, error };
    }
  }
}
