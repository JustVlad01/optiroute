import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { SupabaseService } from '../../services/supabase.service';
import { FormsModule } from '@angular/forms';

interface StoreOrder {
  id?: string;
  customerName: string;
  customerCode?: string;
  totalItems: number;
  status?: string;
}

interface Route {
  id?: string;
  name: string;
  routeNumber?: string;
  driverName?: string;
  deliveryDate?: string;
  status?: string;
  stores: StoreOrder[];
  crateCount?: number;
}

interface Order {
  id?: string;
  fileName: string;
  importDate: string;
  deliveryDate: string;
  status?: string;
  routes: Route[];
}

// Add new interface for masterfile match data
interface MasterfileMatch {
  id: string;
  customer_name: string;
  customer_code: string;
  total_items: number;
  store_name: string;
  store_company: string;
  address_line_1: string;
  eircode: string;
  dispatch_code: string;
  store_code: string;
  door_code: string;
  alarm_code: string;
  fridge_code: string;
  hour_access_24: string;
  earliest_delivery_time: string;
  match_type: string;
  route_id?: string | number;
  store_id?: string;
  city?: string;
  state?: string;
  zipcode?: string;
}

// Add new interface for direct match method
interface StoreMasterfileData {
  id: string;
  dispatch_code: string;
  store_code: string;
  store_name: string;
  store_company: string;
  address_line_1: string;
  eircode: string;
  door_code: string;
  alarm_code: string;
  fridge_code: string;
  hour_access_24: string;
  earliest_delivery_time: string;
  store_id?: string;
  address_line?: string;
  city?: string;
  state?: string;
  zipcode?: string;
  route_id?: string;
}

// Add interface for API responses
interface ApiResponse {
  success: boolean;
  data?: any;
  error?: string;
}

@Component({
  selector: 'app-view-orders',
  standalone: true,
  imports: [CommonModule, RouterModule, FormsModule],
  templateUrl: './view-orders.component.html',
  styleUrls: ['./view-orders.component.scss']
})
export class ViewOrdersComponent implements OnInit {
  orders: Order[] = [];
  isLoading = false;
  isProcessing = false;
  errorMessage: string | null = null;
  successMessage: string | null = null;
  expandedOrderIds: Set<string> = new Set();
  expandedRouteIds: Map<string, Set<string>> = new Map();
  readonly ITEMS_PER_CRATE: number = 25;

  // Add new properties for masterfile matches
  masterfileMatches: MasterfileMatch[] = [];
  unmatchedStores: StoreOrder[] = [];
  isLoadingMatches = false;
  selectedOrderId: string | null = null;
  showMatchesModal = false;

  // Add property for direct masterfile matching
  storeMasterfileData: StoreMasterfileData[] = [];

  // Add new properties for route filtering
  routeFilters: Map<string, Set<string>> = new Map();
  showFilterModal = false;
  filterOrderId: string | null = null;

  // Add new properties for manual store matching
  showStoreSelectModal = false;
  selectedMatch: MasterfileMatch | null = null;
  storeMatchOptions: StoreMasterfileData[] = [];
  searchTerm = '';
  filteredStoreOptions: StoreMasterfileData[] = [];

  // Add new properties for manual match
  isSavingMatch = false;
  selectedStore: StoreMasterfileData | null = null;

  // Add a cache for manual check counts to avoid repeated database calls
  private manualCheckCountCache = new Map<string, Promise<number>>();

  constructor(private supabaseService: SupabaseService) {}

  async ngOnInit(): Promise<void> {
    this.loadOrders();
    
    // Also load store masterfile data for direct matching
    await this.loadStoreMasterfileData();
  }

  async loadOrders(): Promise<void> {
    this.isLoading = true;
    this.errorMessage = null;

    try {
      const data = await this.supabaseService.getAllImportedOrders();
      this.orders = this.processOrdersData(data);
    } catch (error: any) {
      console.error('Error loading orders:', error);
      this.errorMessage = 'Failed to load orders. Please try again later.';
    } finally {
      this.isLoading = false;
    }
  }

  private processOrdersData(data: any[]): Order[] {
    // Group by import ID to create hierarchical structure
    const orderMap = new Map<string, Order>();
    
    data.forEach(item => {
      const importId = item.import_id?.toString();
      
      if (!importId) {
        console.error('Missing import_id in data item:', item);
        return;
      }
      
      if (!orderMap.has(importId)) {
        orderMap.set(importId, {
          id: importId,
          fileName: item.file_name || 'Unknown File',
          importDate: item.import_date || new Date().toISOString(),
          deliveryDate: item.order_delivery_date || 'Not specified',
          status: item.order_status || 'pending',
          routes: []
        });
      }

      const order = orderMap.get(importId)!;
      
      // Check if the route is already added
      const routeId = item.route_id?.toString();
      if (!routeId) {
        console.error('Missing route_id in data item:', item);
        return;
      }
      
      let route = order.routes.find(r => r.id === routeId);
      
      if (!route) {
        route = {
          id: routeId,
          name: item.route_name || 'Unnamed Route',
          routeNumber: item.route_number,
          driverName: item.driver_name,
          deliveryDate: item.route_delivery_date,
          status: item.route_status || 'pending',
          crateCount: item.crate_count,
          stores: []
        };
        order.routes.push(route);
      }
      
      // Add the store to the route if store_id exists
      if (item.store_id) {
        route.stores.push({
          id: item.store_id.toString(),
          customerName: item.customer_name || 'Unknown Customer',
          customerCode: item.customer_code,
          totalItems: item.total_items || 0,
          status: item.store_status || 'pending'
        });
      }
    });

    // Calculate crate counts for any routes where it's not already set
    orderMap.forEach(order => {
      order.routes.forEach(route => {
        if (route.crateCount === undefined) {
          route.crateCount = this.calculateCrateCount(route);
        }
      });
    });
    
    return Array.from(orderMap.values());
  }

  toggleOrderExpand(orderId: string): void {
    if (this.expandedOrderIds.has(orderId)) {
      this.expandedOrderIds.delete(orderId);
    } else {
      this.expandedOrderIds.add(orderId);
    }
  }

  isOrderExpanded(orderId: string): boolean {
    return this.expandedOrderIds.has(orderId);
  }

  toggleRouteExpand(orderId: string, routeId: string): void {
    if (!this.expandedRouteIds.has(orderId)) {
      this.expandedRouteIds.set(orderId, new Set());
    }
    
    const routeSet = this.expandedRouteIds.get(orderId)!;
    
    if (routeSet.has(routeId)) {
      routeSet.delete(routeId);
    } else {
      routeSet.add(routeId);
    }
  }

  isRouteExpanded(orderId: string, routeId: string): boolean {
    return this.expandedRouteIds.has(orderId) && 
           this.expandedRouteIds.get(orderId)!.has(routeId);
  }

  calculateTotalItems(route: Route): number {
    return route.stores.reduce((total, store) => total + store.totalItems, 0);
  }

  calculateTotalStores(route: Route): number {
    return route.stores.length;
  }

  calculateCrateCount(route: Route): number {
    const totalItems = this.calculateTotalItems(route);
    return Math.ceil(totalItems / this.ITEMS_PER_CRATE);
  }

  refreshOrders(): void {
    this.loadOrders();
  }

  async processMasterfileMatches(orderId: string): Promise<void> {
    if (!orderId) return;
    
    // Prevent processing if already in progress
    if (this.isProcessing) return;
    
    this.isProcessing = true;
    this.successMessage = null;
    this.errorMessage = null;
    
    try {
      const result = await this.supabaseService.processMasterfileMatches(parseInt(orderId)) as ApiResponse;
      
      if (result.success) {
        const { processed, matched } = result.data;
        this.successMessage = `Successfully processed ${processed} store orders and matched ${matched} with masterfile data.`;
      } else {
        this.errorMessage = `Failed to process masterfile matches: ${result.error}`;
      }
    } catch (error: any) {
      console.error('Error processing masterfile matches:', error);
      this.errorMessage = 'An unexpected error occurred while processing masterfile matches.';
    } finally {
      this.isProcessing = false;
    }
  }

  // Method to count matches by type
  getMatchTypeCount(matchType: string): number {
    return this.masterfileMatches.filter(match => match.match_type === matchType).length;
  }

  // Method to highlight matching fields
  highlightMatch(value: string, customerName: string): boolean {
    // Check if dispatch code appears in customer name
    if (value && customerName) {
      return customerName.includes(value);
    }
    return false;
  }

  // Show route filter modal before viewing matches
  showRouteFilterForMatches(orderId: string): void {
    this.filterOrderId = orderId;
    
    // Initialize route filters if not already set
    if (!this.routeFilters.has(orderId)) {
      this.selectAllRoutes(orderId);
    }
    
    this.showFilterModal = true;
  }

  // Close route filter modal
  closeFilterModal(): void {
    this.showFilterModal = false;
  }

  // View masterfile matches with filtered routes
  async viewMasterfileMatchesWithFilters(): Promise<void> {
    if (!this.filterOrderId) return;
    
    this.closeFilterModal();
    await this.viewMasterfileMatches(this.filterOrderId);
  }

  // Replace the existing viewMasterfileMatches function
  async viewMasterfileMatches(orderId: string): Promise<void> {
    this.selectedOrderId = orderId;
    this.showMatchesModal = true;
    this.isLoadingMatches = true;
    this.masterfileMatches = [];
    this.unmatchedStores = [];
    this.errorMessage = null;

    try {
      // Always reload masterfile data to get the latest changes
      console.log('Reloading store masterfile data for fresh matches...');
      await this.loadStoreMasterfileData();
      
      if (this.storeMasterfileData.length === 0) {
        console.error('Failed to load any store masterfile data');
        this.errorMessage = 'Unable to load store masterfile data. Cannot perform matching.';
        this.isLoadingMatches = false;
        return;
      }
      
      // Use direct matching to avoid API issues
      console.log('Using direct matching for order:', orderId);
      this.directMatchStores(orderId);
      
      // Check if we found any results
      if (this.masterfileMatches.length === 0 && this.unmatchedStores.length === 0) {
        console.warn('No stores found in this order to match');
        this.errorMessage = 'No stores found in this order to match.';
      }
    } catch (error) {
      console.error('Error during direct matching:', error);
      this.errorMessage = 'An unexpected error occurred while direct matching stores.';
    } finally {
      this.isLoadingMatches = false;
    }
  }

  // Replace the existing findUnmatchedStoresForApiData function
  private findUnmatchedStoresForApiData(orderId: string, matches: MasterfileMatch[]): void {
    const order = this.orders.find(o => o.id === orderId);
    if (!order) return;
    
    this.unmatchedStores = [];
    const selectedRouteIds = this.routeFilters.get(orderId) || new Set<string>();
    const noRoutesSelected = selectedRouteIds.size === 0;
    
    // Get all store IDs that were matched
    const matchedStoreIds = new Set(matches.map(m => m.id));
    
    // Find stores that aren't matched
    order.routes.forEach(route => {
      // Skip routes that weren't selected (if any routes were selected)
      if (!noRoutesSelected && !selectedRouteIds.has(route.id!)) return;
      
      route.stores.forEach(store => {
        if (store.id && !matchedStoreIds.has(store.id)) {
          this.unmatchedStores.push(store);
        }
      });
    });
  }

  // Get the percentage of matched stores
  getMatchPercentage(): number {
    const totalStores = this.masterfileMatches.length + this.unmatchedStores.length;
    if (totalStores === 0) return 0;
    return Math.round((this.masterfileMatches.length / totalStores) * 100);
  }
  
  closeMatchesModal(): void {
    this.showMatchesModal = false;
    this.masterfileMatches = [];
    this.selectedOrderId = null;
  }
  
  getMatchTypeLabel(matchType: string): string {
    switch (matchType) {
      case 'store_code_match': return 'Store Code';
      case 'dispatch_code_match': return 'Dispatch Code';
      case 'address_match': return 'Manual Check';
      case 'name_exact_match': return 'Exact Name';
      case 'name_match': return 'Name Match';
      case 'name_fuzzy_match': return 'Similar Name';
      case 'manual_match': return 'Manual Match';
      default: return matchType;
    }
  }

  getMatchTypeClass(matchType: string): string {
    switch (matchType) {
      case 'store_code_match': return 'match-exact';
      case 'dispatch_code_match': return 'match-good';
      case 'address_match': return 'match-good';
      case 'name_exact_match': return 'match-good';
      case 'name_match': return 'match-medium';
      case 'name_fuzzy_match': return 'match-fuzzy';
      case 'manual_match': return 'match-manual';
      default: return '';
    }
  }

  // Add method to load store masterfile data
  async loadStoreMasterfileData(): Promise<void> {
    console.log('Loading store masterfile data...');
    try {
      // Clear existing data to ensure we're not using cached data
      this.storeMasterfileData = [];
      
      const data: any = await this.supabaseService.getStoreInformation();
      console.log('Store information API response:', data);
      
      if (data && Array.isArray(data) && data.length > 0) {
        // Map the data from either store_information or stores table with improved field mapping
        this.storeMasterfileData = data.map((item: any) => {
          // Determine source table type based on field existence
          const isStoresTable = item.hasOwnProperty('store_id') && !item.hasOwnProperty('id');
          
          return {
            // Handle both ID formats correctly
            id: isStoresTable ? item.store_id?.toString() : item.id?.toString() || '',
            
            // Handle various field mappings with appropriate fallbacks
            dispatch_code: item.dispatch_code || '',
            store_code: item.store_code || '',
            store_name: item.store_name || '',
            store_company: item.store_company || '',
            
            // Handle column name differences between tables
            address_line_1: isStoresTable ? (item.address_line || '') : (item.address_line_1 || ''),
            
            // Handle other fields with appropriate fallbacks
            eircode: item.eircode || '',
            door_code: item.door_code || '',
            alarm_code: item.alarm_code || '',
            fridge_code: item.fridge_code || '',
            hour_access_24: item.hour_access_24 || '',
            earliest_delivery_time: item.earliest_delivery_time || '',
            store_id: isStoresTable ? item.store_id?.toString() : item.id?.toString() || '',
            address_line: isStoresTable ? item.address_line : item.address_line_1 || '',
            city: item.city,
            state: item.state,
            zipcode: item.zipcode,
            route_id: item.route_id?.toString() || '',
          };
        });
        
        console.log(`Loaded ${this.storeMasterfileData.length} store records`);
      } else {
        console.error('No data returned from getStoreInformation()');
      }
    } catch (error) {
      console.error('Error loading store masterfile data:', error);
    }
  }

  // Add new method to toggle route selection for filtering
  toggleRouteFilter(orderId: string, routeId: string): void {
    if (!this.routeFilters.has(orderId)) {
      this.routeFilters.set(orderId, new Set());
    }
    
    const routeSet = this.routeFilters.get(orderId)!;
    
    if (routeSet.has(routeId)) {
      routeSet.delete(routeId);
    } else {
      routeSet.add(routeId);
    }
  }

  // Check if a route is selected for filtering
  isRouteFilterSelected(orderId: string, routeId: string): boolean {
    return this.routeFilters.has(orderId) && 
           this.routeFilters.get(orderId)!.has(routeId);
  }

  // Select all routes for an order
  selectAllRoutes(orderId: string): void {
    const order = this.orders.find(o => o.id === orderId);
    if (!order) return;
    
    const routeSet = new Set<string>();
    order.routes.forEach(route => {
      routeSet.add(route.id!);
    });
    
    this.routeFilters.set(orderId, routeSet);
  }

  // Deselect all routes for an order
  deselectAllRoutes(orderId: string): void {
    if (this.routeFilters.has(orderId)) {
      this.routeFilters.get(orderId)!.clear();
    }
  }

  // Add a direct method to match store orders with masterfile data (modified for route filtering)
  directMatchStores(orderId: string): void {
    if (!orderId) {
      console.error('Missing orderId for directMatchStores');
      this.errorMessage = 'Missing order ID for matching';
      this.isLoadingMatches = false;
      return;
    }
    
    try {
      // Find the order
      const order = this.orders.find(o => o.id === orderId);
      if (!order) {
        console.error('Order not found:', orderId);
        this.errorMessage = 'Order not found';
        this.isLoadingMatches = false;
        return;
      }
      
      // Check if we have the store masterfile data loaded 
      if (this.storeMasterfileData.length === 0) {
        console.error('No store masterfile data available for direct matching');
        this.errorMessage = 'Unable to load store masterfile data. Cannot perform matching.';
        this.isLoadingMatches = false;
        return;
      }
      
      console.log('Starting direct match with store masterfile data:', 
        this.storeMasterfileData.length, 'records available');
      
      // Get selected route IDs for the specified order
      const selectedRouteIds = this.routeFilters.get(orderId) || new Set<string>();
      const noRoutesSelected = selectedRouteIds.size === 0;
      
      // Process each store in each route
      const matches: MasterfileMatch[] = [];
      let id = 1;
      
      // Create a list to keep track of unmatched stores
      const allStores: StoreOrder[] = [];
      const matchedStoreIds: Set<string> = new Set();
      
      // Ensure routes exist before iterating
      if (!order.routes || !Array.isArray(order.routes)) {
        console.error('No routes found in order:', orderId);
        this.errorMessage = 'No routes found in this order';
        this.isLoadingMatches = false;
        return;
      }
      
      // First, check if we have any manual matches for this order
      // We'll do this by fetching the store_matches table data
      this.supabaseService.getManualStoreMatches().then((manualMatches: any[]) => {
        console.log('Retrieved manual store matches:', manualMatches);
        
        // Create a map for faster lookups
        const manualMatchMap = new Map();
        if (manualMatches && Array.isArray(manualMatches)) {
          manualMatches.forEach(match => {
            // Use customer name and code as the key
            const key = `${match.customer_name}|${match.customer_code || ''}`;
            manualMatchMap.set(key, match);
          });
        }
        
        // Now process each store
        order.routes.forEach(route => {
          // Skip routes that weren't selected (if any routes were selected)
          if (!noRoutesSelected && !selectedRouteIds.has(route.id!)) return;
          
          // Ensure stores exist before iterating
          if (!route.stores || !Array.isArray(route.stores)) {
            console.warn(`No stores found in route: ${route.id}`);
            return;
          }
          
          route.stores.forEach(store => {
            // Add to all stores list
            allStores.push(store);
            
            if (!store.customerName) {
              console.log('Skipping store with no customer name');
              return;
            }
            
            // Extract potential identifiers from the customer name
            let dispatchCode: string | null = null;
            let storeCode: string | null = store.customerCode || null;
            let storeName: string | null = null;
            
            // Improved dispatch code extraction to handle formats like "D7001. Brentwood"
            // Try to extract dispatch code (formats: "1001C", "D7001", "D7001.")
            const dispatchMatch = store.customerName.match(/^([A-Za-z]?[0-9]+[A-Za-z]?)\.?\s*/);
            if (dispatchMatch) {
              dispatchCode = dispatchMatch[1];
            }
            
            // Extract store name without code parts
            storeName = store.customerName
              .replace(/^([A-Za-z]?[0-9]+[A-Za-z]?)\.?\s*/, '')
              .replace(/\([0-9]+\)/, '')
              .trim();
            
            let matchedStore: StoreMasterfileData | undefined;
            let matchType = 'unknown';
            
            // First check if we have a manual match for this store
            const manualMatchKey = `${store.customerName}|${store.customerCode || ''}`;
            const manualMatch = manualMatchMap.get(manualMatchKey);
            
            if (manualMatch) {
              // We have a manual match! Find the corresponding store in our masterfile data
              matchedStore = this.storeMasterfileData.find(m => 
                m.store_id === manualMatch.masterfile_store_id || 
                m.id === manualMatch.masterfile_store_id
              );
              
              if (matchedStore) {
                matchType = 'manual_match';
                console.log('Found manual match for store:', store.customerName);
              }
            }
            
            // If no manual match was found, continue with the regular matching process
            if (!matchedStore) {
              // Set up priority-based matching (higher priority matches should exit early)
              
              // First priority: Try matching by store code (most reliable)
              if (storeCode) {
                matchedStore = this.storeMasterfileData.find(m => m.store_code === storeCode);
                if (matchedStore) {
                  matchType = 'store_code_match';
                  // Found highest priority match, no need to try other match types
                }
              }
              
              // Second priority: Try matching by dispatch code
              if (!matchedStore && dispatchCode) {
                matchedStore = this.storeMasterfileData.find(m => {
                  // Handle case variations and trim spaces
                  const mDispatchCode = m.dispatch_code ? m.dispatch_code.trim() : '';
                  const sDispatchCode = dispatchCode?.trim() || '';
                  return mDispatchCode.toLowerCase() === sDispatchCode.toLowerCase();
                });
                if (matchedStore) {
                  matchType = 'dispatch_code_match';
                  // Found second highest priority match, no need to try other match types
                }
              }
              
              // Only try address/location matching if we haven't found a store/dispatch code match
              if (!matchedStore && storeName && storeName.length > 0) {
                const addressMatch = this.storeMasterfileData.find(m => 
                  m.address_line_1 && m.address_line_1.length > 0 && 
                  storeName.toLowerCase().includes(m.address_line_1.toLowerCase())
                );
                
                if (addressMatch) {
                  matchedStore = addressMatch;
                  matchType = 'address_match';
                } else {
                  // Only try name matching if we haven't found any higher priority match
                  // First try exact name match
                  matchedStore = this.storeMasterfileData.find(m => 
                    (m.store_name && m.store_name.length > 0 && m.store_name.toLowerCase() === storeName.toLowerCase()) ||
                    (m.store_company && m.store_company.length > 0 && m.store_company.toLowerCase() === storeName.toLowerCase())
                  );
                  
                  if (matchedStore) {
                    matchType = 'name_exact_match';
                  } else {
                    // Try partial name matching as last resort
                    matchedStore = this.storeMasterfileData.find(m => 
                      (m.store_name && m.store_name.length > 0 && 
                        (storeName.toLowerCase().includes(m.store_name.toLowerCase()) || 
                         m.store_name.toLowerCase().includes(storeName.toLowerCase()))) ||
                      (m.store_company && m.store_company.length > 0 && 
                        (m.store_company.toLowerCase().includes(storeName.toLowerCase()) ||
                         storeName.toLowerCase().includes(m.store_company.toLowerCase())))
                    );
                    
                    if (matchedStore) {
                      matchType = 'name_match';
                    }
                  }
                }
              }
            }
            
            // If a match is found, add it to the matches array
            if (matchedStore) {
              matches.push({
                id: store.id || (id++).toString(), // Use store.id as match identifier for easier filtering
                customer_name: store.customerName,
                customer_code: storeCode || '',
                total_items: store.totalItems || 0,
                store_name: matchedStore.store_name || '',
                store_company: matchedStore.store_company || '',
                address_line_1: matchedStore.address_line_1 || '',
                eircode: matchedStore.eircode || '',
                dispatch_code: matchedStore.dispatch_code || dispatchCode || '',
                store_code: matchedStore.store_code || '',
                door_code: matchedStore.door_code || '',
                alarm_code: matchedStore.alarm_code || '',
                fridge_code: matchedStore.fridge_code || '',
                hour_access_24: matchedStore.hour_access_24 || '',
                earliest_delivery_time: matchedStore.earliest_delivery_time || '',
                match_type: matchType,
                route_id: route.id,
                store_id: matchedStore.store_id || matchedStore.id,
                city: matchedStore.city,
                state: matchedStore.state,
                zipcode: matchedStore.zipcode,
              });
              
              // Add to matched store IDs set
              if (store.id) {
                matchedStoreIds.add(store.id);
              }
            }
          });
        });
        
        // Set matched stores
        this.masterfileMatches = matches;
        
        // Set unmatched stores
        this.unmatchedStores = allStores.filter(store => 
          store.id && !matchedStoreIds.has(store.id)
        );
        
        console.log(`Found ${this.masterfileMatches.length} matches and ${this.unmatchedStores.length} unmatched stores`);
        
        // Sort matches by route ID and then by customer name
        this.masterfileMatches.sort((a, b) => {
          if (a.route_id === b.route_id) {
            return a.customer_name.localeCompare(b.customer_name);
          }
          return a.route_id && b.route_id ? 
            String(a.route_id).localeCompare(String(b.route_id)) : 0;
        });
        
        // Reset loading and error state
        this.isLoadingMatches = false;
        this.errorMessage = null;
      }).catch((error: any) => {
        console.error('Error getting manual store matches:', error);
        // Continue with the matching process anyway
        this.isLoadingMatches = false;
        this.errorMessage = null;
      });
    } catch (error) {
      console.error('Error in directMatchStores:', error);
      this.errorMessage = 'An error occurred while matching stores';
      this.isLoadingMatches = false;
    }
  }

  // Show the store selection modal for manually matching a store
  openStoreSelectModal(match: MasterfileMatch): void {
    this.selectedMatch = match;
    this.searchTerm = match.customer_name;
    this.storeMatchOptions = [...this.storeMasterfileData];
    this.filterStoreOptions();
    this.showStoreSelectModal = true;
  }

  // Close the store selection modal
  closeStoreSelectModal(): void {
    this.showStoreSelectModal = false;
    this.selectedMatch = null;
    this.searchTerm = '';
  }

  // Filter store options based on search term
  filterStoreOptions(): void {
    if (!this.searchTerm.trim()) {
      this.filteredStoreOptions = [...this.storeMatchOptions];
      } else {
      const term = this.searchTerm.toLowerCase().trim();
      this.filteredStoreOptions = this.storeMatchOptions.filter(store => 
        (store.store_name && store.store_name.toLowerCase().includes(term)) ||
        (store.store_company && store.store_company.toLowerCase().includes(term)) ||
        (store.dispatch_code && store.dispatch_code.toLowerCase().includes(term)) ||
        (store.store_code && store.store_code.toLowerCase().includes(term)) ||
        (store.address_line_1 && store.address_line_1.toLowerCase().includes(term))
      );
    }
  }

  // Update the search term and filter results
  updateSearch(event: any): void {
    this.searchTerm = event.target.value;
    this.filterStoreOptions();
  }

  // Save the manual store match to the database
  async saveManualMatch(): Promise<void> {
    if (!this.selectedMatch || !this.selectedStore) {
      console.error('Missing required data for manual match');
      return;
    }

    this.isSavingMatch = true;
    try {
      const result = await this.supabaseService.saveManualStoreMatch(
        this.selectedMatch.store_id || '',
        this.selectedStore.store_id || this.selectedStore.id || '',
        this.selectedMatch.customer_name,
        this.selectedMatch.customer_code || ''
      );

      if (result.success) {
        console.log('Manual match saved successfully:', result.data);
        
        // Update the match in the current list with the new data
        const matchIndex = this.masterfileMatches.findIndex(m => 
          m.customer_name === this.selectedMatch!.customer_name && 
          m.customer_code === this.selectedMatch!.customer_code
        );
        
        if (matchIndex >= 0) {
          // Update the existing match with the new store data
          const updatedMatch: MasterfileMatch = { 
            ...this.masterfileMatches[matchIndex],
            match_type: 'manual_match',
            store_id: this.selectedStore.store_id || this.selectedStore.id || '',
            // Copy over properties from the selected store
            store_name: this.selectedStore.store_name || '',
            address_line_1: this.selectedStore.address_line_1 || this.selectedStore.address_line || '',
            city: this.selectedStore.city || '',
            state: this.selectedStore.state || '',
            zipcode: this.selectedStore.zipcode || '',
            route_id: this.selectedStore.route_id || '',
            dispatch_code: this.selectedStore.dispatch_code || '',
            store_code: this.selectedStore.store_code || ''
          };
          
          this.masterfileMatches[matchIndex] = updatedMatch;
          console.log('Updated match in local array:', updatedMatch);
        }
        
        // Force a refresh of the store masterfile data to ensure it's up to date
        await this.loadStoreMasterfileData();
        
        // Clear the manual check count cache to ensure counts are recalculated
        this.clearManualCheckCountCache();
        
        // Close the modal
        this.closeStoreSelectModal();
        
        // Show success message
        this.successMessage = 'Store match saved successfully!';
        setTimeout(() => this.successMessage = null, 5000);
      } else {
        console.error('Failed to save manual match:', result.error);
        this.errorMessage = 'Failed to save store match: ' + (result.error?.message || 'Unknown error');
        setTimeout(() => this.errorMessage = null, 5000);
      }
    } catch (error) {
      console.error('Exception during manual match save:', error);
      this.errorMessage = 'An error occurred while saving the match';
      setTimeout(() => this.errorMessage = null, 5000);
    } finally {
      this.isSavingMatch = false;
    }
  }

  // Add a debug method to show match details
  getMatchDetails(match: MasterfileMatch): string {
    const details = [];
    
    if (match.dispatch_code) {
      details.push(`Dispatch: ${match.dispatch_code}`);
    }
    
    if (match.store_code) {
      details.push(`Store: ${match.store_code}`);
    }
    
    return details.join(' | ');
  }

  // Calculate the number of manual checks needed for a route
  calculateManualChecksForRoute(orderId: string, routeId: string | number): Promise<number> {
    // Create a cache key based on order ID and route ID
    const cacheKey = `${orderId}-${routeId}`;
    
    // Check if we have a cached result
    if (this.manualCheckCountCache.has(cacheKey)) {
      return this.manualCheckCountCache.get(cacheKey)!;
    }
    
    // If not cached, calculate and cache the result
    const countPromise = this.calculateManualChecksForRouteInternal(orderId, routeId);
    this.manualCheckCountCache.set(cacheKey, countPromise);
    
    return countPromise;
  }
  
  // Internal method to calculate manual checks
  private async calculateManualChecksForRouteInternal(orderId: string, routeId: string | number): Promise<number> {
    // First run a quick direct match to get the matches
    const order = this.orders.find(o => o.id === orderId);
    if (!order) return 0;
    
    // Get all stores in this route
    const route = order.routes.find(r => r.id === routeId);
    if (!route) return 0;
    
    let manualCheckCount = 0;
    
    // Get any manual matches from the database
    let manualMatches: any[] = [];
    try {
      manualMatches = await this.supabaseService.getManualStoreMatches();
      console.log(`Retrieved ${manualMatches.length} manual matches for route check`);
    } catch (error) {
      console.error('Error fetching manual matches:', error);
    }
    
    // Create a map for faster lookups
    const manualMatchMap = new Map();
    if (manualMatches && Array.isArray(manualMatches)) {
      manualMatches.forEach(match => {
        // Use customer name and code as the key
        const key = `${match.customer_name}|${match.customer_code || ''}`;
        manualMatchMap.set(key, match);
      });
    }
    
    // For each store in the route, check if it would match as an address_match
    route.stores.forEach(store => {
      if (!store.customerName) return;
      
      // First check if this store already has a manual match
      const manualMatchKey = `${store.customerName}|${store.customerCode || ''}`;
      const manualMatch = manualMatchMap.get(manualMatchKey);
      
      // If there's already a manual match, skip this store
      if (manualMatch) {
        return;
      }
      
      // Also check if this store is in the masterfileMatches array with a manual_match type
      const hasManualMatchInMemory = this.masterfileMatches.some(match => 
        match.match_type === 'manual_match' && 
        match.customer_name === store.customerName && 
        match.customer_code === (store.customerCode || '')
      );
      
      // If there's already a manual match in memory, skip this store
      if (hasManualMatchInMemory) {
        return;
      }
      
      // Extract potential identifiers from the customer name
      let dispatchCode: string | null = null;
      let storeCode: string | null = store.customerCode || null;
      let storeName: string | null = null;
      
      // Try to extract dispatch code
      const dispatchMatch = store.customerName.match(/^([A-Za-z]?[0-9]+[A-Za-z]?)\.?\s*/);
      if (dispatchMatch) {
        dispatchCode = dispatchMatch[1];
      }
      
      // Extract store name without code parts
      storeName = store.customerName
        .replace(/^([A-Za-z]?[0-9]+[A-Za-z]?)\.?\s*/, '')
        .replace(/\([0-9]+\)/, '')
        .trim();
      
      // Check if this would be a dispatch code or store code match (these don't need manual checks)
      const hasExactMatch = this.storeMasterfileData.some(m => 
        (storeCode && m.store_code === storeCode) || 
        (dispatchCode && m.dispatch_code && m.dispatch_code.trim().toLowerCase() === dispatchCode.trim().toLowerCase())
      );
      
      // If no exact match, check if it would be an address match (which needs manual check)
      if (!hasExactMatch && storeName && storeName.length > 0) {
        const hasAddressMatch = this.storeMasterfileData.some(m => 
          m.address_line_1 && m.address_line_1.length > 0 && 
          storeName.toLowerCase().includes(m.address_line_1.toLowerCase())
        );
        
        if (hasAddressMatch) {
          manualCheckCount++;
        }
      }
    });
    
    return manualCheckCount;
  }
  
  // Method to clear the manual check count cache when a manual match is saved
  clearManualCheckCountCache(): void {
    this.manualCheckCountCache.clear();
  }
} 