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
}
