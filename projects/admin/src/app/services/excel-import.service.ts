import { Injectable } from '@angular/core';
import { SupabaseService } from './supabase.service';
import { BehaviorSubject } from 'rxjs';
import * as XLSX from 'xlsx';
import { StoreImportService } from './store-import.service';

export interface StoreOrder {
  routeName: string;
  storeName: string;
  totalQuantity: number;
  cratesNeeded: number;
}

export interface ParsedRouteData {
  routeName: string;
  stores: {
    storeName: string;
    totalQuantity: number;
    cratesNeeded: number;
  }[];
}

@Injectable({
  providedIn: 'root'
})
export class ExcelImportService {
  private loadingSubject = new BehaviorSubject<boolean>(false);
  loading$ = this.loadingSubject.asObservable();

  private messageSubject = new BehaviorSubject<{type: 'success' | 'error', text: string} | null>(null);
  message$ = this.messageSubject.asObservable();

  private parsedDataSubject = new BehaviorSubject<ParsedRouteData[]>([]);
  parsedData$ = this.parsedDataSubject.asObservable();

  // Each crate can hold 25 items
  private crateCapacity = 25;

  constructor(
    private supabaseService: SupabaseService,
    private storeImportService: StoreImportService
  ) { }

  /**
   * Parse Excel file and extract route and store data
   * @param file Excel file to parse
   * @returns Promise with parsed data
   */
  async parseExcelFile(file: File): Promise<ParsedRouteData[]> {
    this.loadingSubject.next(true);
    this.messageSubject.next(null);
    
    try {
      // Read the Excel file
      const data = await this.readExcelFile(file);
      
      if (!data || !data.length) {
        this.messageSubject.next({
          type: 'error',
          text: 'No data found in the Excel file'
        });
        return [];
      }
      
      const parsedRoutes: ParsedRouteData[] = [];
      let currentRoute: ParsedRouteData | null = null;
      
      // Iterate through each row in the Excel file
      for (let i = 0; i < data.length; i++) {
        const row = data[i];
        
        // Check for "Driver Run" in column A (also handle "Driver Run:" with colon)
        if (row['A'] && 
            (row['A'] === 'Driver Run' || 
             row['A'] === 'Driver Run:' || 
             row['A'].trim().toLowerCase() === 'driver run' ||
             row['A'].trim().toLowerCase() === 'driver run:')) {
          
          // Get the route name from column B
          const routeName = row['B'] ? row['B'].trim() : '';
          
          if (routeName) {
            // Start a new route
            if (currentRoute) {
              parsedRoutes.push(currentRoute);
            }
            
            currentRoute = {
              routeName: routeName,
              stores: []
            };
            
            console.log(`Found route: ${routeName}`);
          }
        } else if (currentRoute && row['A'] && row['D'] !== undefined) {
          // Check if row has store name and quantity > 0
          const storeName = row['A'].trim();
          const totalQuantity = parseInt(row['D'], 10) || 0;
          
          if (totalQuantity > 0) {
            // Calculate crates needed - round up to nearest whole number
            const cratesNeeded = Math.ceil(totalQuantity / this.crateCapacity);
            
            currentRoute.stores.push({
              storeName: storeName,
              totalQuantity: totalQuantity,
              cratesNeeded: cratesNeeded
            });
            
            console.log(`Added store: ${storeName}, Quantity: ${totalQuantity}, Crates: ${cratesNeeded}`);
          }
        }
      }
      
      // Add the last route if it exists
      if (currentRoute) {
        parsedRoutes.push(currentRoute);
      }
      
      // Update the parsed data subject
      this.parsedDataSubject.next(parsedRoutes);
      
      if (parsedRoutes.length === 0) {
        this.messageSubject.next({
          type: 'error',
          text: 'No valid routes found in the Excel file. Make sure the file contains "Driver Run" in column A with route names in column B.'
        });
      } else {
        const totalStores = parsedRoutes.reduce((total, route) => total + route.stores.length, 0);
        this.messageSubject.next({
          type: 'success',
          text: `Successfully parsed ${parsedRoutes.length} routes with ${totalStores} stores`
        });
      }
      
      return parsedRoutes;
    } catch (error: any) {
      console.error('Error parsing Excel file:', error);
      this.messageSubject.next({
        type: 'error',
        text: `Error parsing Excel file: ${error.message || 'Unknown error'}`
      });
      return [];
    } finally {
      this.loadingSubject.next(false);
    }
  }
  
  /**
   * Read Excel file and convert to JSON
   * @param file Excel file to read
   * @returns Promise with JSON data
   */
  private async readExcelFile(file: File): Promise<any[]> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      
      reader.onload = (e: any) => {
        try {
          const data = e.target.result;
          const workbook = XLSX.read(data, { type: 'binary' });
          
          // Get the first sheet
          const firstSheetName = workbook.SheetNames[0];
          const worksheet = workbook.Sheets[firstSheetName];
          
          // Convert to JSON
          const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 'A' });
          resolve(jsonData);
        } catch (error) {
          reject(error);
        }
      };
      
      reader.onerror = (error) => {
        reject(error);
      };
      
      reader.readAsBinaryString(file);
    });
  }
  
  /**
   * Save parsed data to Supabase
   * @param parsedData The parsed route data to save
   * @returns Promise with result of the save operation
   */
  async saveToSupabase(parsedData: ParsedRouteData[]): Promise<{ success: boolean, data?: any, error?: any }> {
    this.loadingSubject.next(true);
    
    try {
      if (!parsedData || parsedData.length === 0) {
        return { success: false, error: 'No data to save' };
      }
      
      // Transform the data to the format expected by the backend
      const transformedData = parsedData.map(route => {
        return {
          route_name: route.routeName,
          total_items: route.stores.reduce((sum, store) => sum + store.totalQuantity, 0),
          crate_count: route.stores.reduce((sum, store) => sum + store.cratesNeeded, 0),
          full_crates: Math.floor(route.stores.reduce((sum, store) => sum + store.totalQuantity, 0) / 25),
          remaining_items: route.stores.reduce((sum, store) => sum + store.totalQuantity, 0) % 25,
          stores: route.stores.map(store => ({
            storeName: store.storeName,
            totalQuantity: store.totalQuantity,
            cratesNeeded: store.cratesNeeded
          }))
        };
      });
      
      // Call the simplified import stores method
      await this.storeImportService.importStores(transformedData);
      
      // The messaging will be handled by storeImportService
      return { success: true };
    } catch (error: any) {
      console.error('Error saving to Supabase:', error);
      this.messageSubject.next({
        type: 'error',
        text: `Error saving data: ${error.message || 'Unknown error'}`
      });
      return { success: false, error };
    } finally {
      this.loadingSubject.next(false);
    }
  }
} 