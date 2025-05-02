import { Injectable } from '@angular/core';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { environment } from '../../environments/environment.development'; // Use development for now

@Injectable({
  providedIn: 'root'
})
export class SupabaseService {
  private supabase: SupabaseClient;

  constructor() {
    this.supabase = createClient(environment.supabaseUrl, environment.supabaseKey);
  }

  // Method to add a new driver
  async addDriver(name: string, customId: string, role: string, location: string, phoneNumber?: string) {
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
    const { data, error } = await this.supabase
      .from('drivers')
      .select('*')
      .order('name');

    if (error) {
      console.error('Error fetching drivers:', error);
      return null;
    }

    return data;
  }

  // Method to delete a driver
  async deleteDriver(driverId: number) {
    const { error } = await this.supabase
      .from('drivers')
      .delete()
      .eq('id', driverId);

    if (error) {
      console.error('Error deleting driver:', error);
      return false;
    }

    return true;
  }

  // You can add more methods here later
}
