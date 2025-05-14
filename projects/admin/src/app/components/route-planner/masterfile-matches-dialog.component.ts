import { Component, Inject, OnInit, Input } from '@angular/core';
import { MAT_DIALOG_DATA } from '@angular/material/dialog';
import { CommonModule } from '@angular/common';

interface RouteWithStores {
  routeName: string;
  stores: any[];
  totalItems: number;
}

@Component({
  selector: 'app-masterfile-matches-dialog',
  templateUrl: './masterfile-matches-dialog.component.html',
  styleUrls: ['./masterfile-matches-dialog.component.scss'],
  imports: [CommonModule],
  standalone: true
})
export class MasterfileMatchesDialogComponent implements OnInit {
  @Input() data: any;
  matchesCount: number = 0;
  totalStores: number = 0;
  matchPercentage: number = 0;
  storeCodeMatches: number = 0;
  dispatchMatches: number = 0;
  addressMatches: number = 0;
  exactNameMatches: number = 0;
  partialMatches: number = 0;
  fuzzyMatches: number = 0;
  unmatchedCount: number = 0;
  
  matches: any[] = [];
  unmatched: any[] = [];
  
  // Added for segregated routes
  segregatedRoutes: string[] = [];
  
  // Group stores by route
  routesWithStores: RouteWithStores[] = [];
  
  // Track expanded state of routes
  expandedRoutes: Set<string> = new Set();

  constructor(@Inject(MAT_DIALOG_DATA) public dialogData: any) {
  }

  ngOnInit(): void {
    if (this.data && this.data.matches) {
      // Map fields properly to ensure consistency
      this.preprocessData();
      
      // Calculate stats
      this.totalStores = this.data.matches.length;
      this.matchesCount = this.data.matches.filter((match: any) => match.matchType !== 'unmatched').length;
      this.matchPercentage = this.totalStores > 0 ? (this.matchesCount / this.totalStores) * 100 : 0;
      
      // Count match types
      this.storeCodeMatches = this.data.matches.filter((match: any) => match.matchType === 'storeCode').length;
      this.dispatchMatches = this.data.matches.filter((match: any) => match.matchType === 'dispatch').length;
      this.addressMatches = this.data.matches.filter((match: any) => match.matchType === 'address').length;
      this.exactNameMatches = this.data.matches.filter((match: any) => match.matchType === 'exactName').length;
      this.partialMatches = this.data.matches.filter((match: any) => match.matchType === 'partial').length;
      this.fuzzyMatches = this.data.matches.filter((match: any) => match.matchType === 'similar').length;
      this.unmatchedCount = this.data.matches.filter((match: any) => match.matchType === 'unmatched').length;
      
      // Process for segregated routes
      this.identifySegregatedRoutes();
      
      // Group matches by route
      this.groupMatchesByRoute();
      
      // Initialize data for the new UI
      this.processMatches();
    }
  }
  
  // Preprocess data to ensure field naming consistency
  private preprocessData(): void {
    if (!this.data || !this.data.matches) return;
    
    // Map fields for each match
    this.data.matches.forEach((match: any) => {
      if (match.masterStore) {
        // Handle address field variations
        if (!match.masterStore.address_line && match.masterStore.address_line_1) {
          match.masterStore.address_line = match.masterStore.address_line_1;
        } else if (!match.masterStore.address_line && match.masterStore.address) {
          match.masterStore.address_line = match.masterStore.address;
        }
        
        // If no address at all, add an empty one to prevent template errors
        if (!match.masterStore.address_line) {
          match.masterStore.address_line = '';
        }
        
        // Also check if the data is coming directly from the SQL view
        // In that case, we need to migrate the data from the root level to the masterStore object
        if (!match.masterStore.address_line && match.address_line) {
          match.masterStore.address_line = match.address_line;
        }
        if (!match.masterStore.address_line && match.address_line_1) {
          match.masterStore.address_line = match.address_line_1;
        }
        
        // Make sure all code and time fields are available at masterStore level
        const fieldsToCheck = [
          'door_code', 'alarm_code', 'fridge_code', 'hour_access_24',
          'mon', 'tue', 'wed', 'thur', 'fri', 'sat', 
          'earliest_delivery_time', 'opening_time_saturday', 'openining_time_bankholiday'
        ];
        
        fieldsToCheck.forEach(field => {
          // If field exists at root level but not at masterStore level, copy it
          if (match[field] && !match.masterStore[field]) {
            match.masterStore[field] = match[field];
          }
          
          // Ensure the field exists (even if empty) on masterStore
          if (!match.masterStore[field]) {
            match.masterStore[field] = '';
          }
        });
      }
    });
  }
  
  // Group matches by route for the routes view
  private groupMatchesByRoute(): void {
    if (!this.data || !this.data.matches) return;
    
    const routeMap = new Map<string, any[]>();
    
    // First pass: group stores by route
    this.data.matches.forEach((match: any) => {
      if (match.masterStore) {
        // Check each route field
        ['old_route', 'new_route_08_05', 'route8_5_25'].forEach(routeField => {
          const routeName = match.masterStore[routeField];
          if (routeName) {
            if (!routeMap.has(routeName)) {
              routeMap.set(routeName, []);
            }
            
            // Only add the store if it's not already in the route (avoid duplicates)
            const stores = routeMap.get(routeName);
            if (!stores?.some(s => s.orderStore.id === match.orderStore.id)) {
              routeMap.get(routeName)!.push(match);
            }
          }
        });
      }
    });
    
    // Second pass: create RouteWithStores objects
    this.routesWithStores = Array.from(routeMap.entries()).map(([routeName, stores]) => {
      // Calculate total items for the route
      const totalItems = stores.reduce((sum, store) => sum + store.orderStore.totalItems, 0);
      
      return {
        routeName,
        stores,
        totalItems
      };
    });
    
    // Sort routes by name
    this.routesWithStores.sort((a, b) => a.routeName.localeCompare(b.routeName));
    
    // Expand first route by default
    if (this.routesWithStores.length > 0) {
      this.expandedRoutes.add(this.routesWithStores[0].routeName);
    }
  }
  
  // New method to identify segregated routes
  private identifySegregatedRoutes(): void {
    if (!this.data || !this.data.matches) return;
    
    const routesSet = new Set<string>();
    
    // Loop through all matches to identify segregated routes
    this.data.matches.forEach((match: any) => {
      if (match.masterStore && (
          match.masterStore.is_segregated === true || 
          match.masterStore.is_segregated === 'true' || 
          match.masterStore.is_segregated === 'yes'
        )) {
        // Add routes from stores marked as segregated
        if (match.masterStore.old_route) routesSet.add(match.masterStore.old_route);
        if (match.masterStore.new_route_08_05) routesSet.add(match.masterStore.new_route_08_05);
        if (match.masterStore.route8_5_25) routesSet.add(match.masterStore.route8_5_25);
      }
    });
    
    // Convert set to array and sort
    this.segregatedRoutes = Array.from(routesSet).filter(r => !!r).sort();
  }
  
  // Check if a route is in the segregated routes list
  isSegregatedRoute(route: string): boolean {
    return this.segregatedRoutes.includes(route);
  }
  
  // Check if a store belongs to a segregated route
  isSegregatedStore(match: any): boolean {
    if (!match.masterStore) return false;
    
    const isSegregatedStore = match.masterStore.is_segregated === true || 
                             match.masterStore.is_segregated === 'true' || 
                             match.masterStore.is_segregated === 'yes';
                             
    const hasSegregatedRoute = 
      (match.masterStore.old_route && this.isSegregatedRoute(match.masterStore.old_route)) ||
      (match.masterStore.new_route_08_05 && this.isSegregatedRoute(match.masterStore.new_route_08_05)) ||
      (match.masterStore.route8_5_25 && this.isSegregatedRoute(match.masterStore.route8_5_25));
      
    return isSegregatedStore || hasSegregatedRoute;
  }
  
  // Method to process matches for the new UI format
  private processMatches(): void {
    if (!this.data || !this.data.matches) return;
    
    // Set up counts
    this.matchesCount = this.data.matches.length;
    this.totalStores = this.data.totalStores || this.matchesCount;
    if (this.totalStores > 0) {
      this.matchPercentage = (this.matchesCount / this.totalStores) * 100;
    }
    
    // Count match types
    this.storeCodeMatches = this.data.matches.filter((m: any) => m.matchType === 'storeCode').length;
    this.dispatchMatches = this.data.matches.filter((m: any) => m.matchType === 'dispatch').length;
    this.addressMatches = this.data.matches.filter((m: any) => m.matchType === 'address').length;
    this.exactNameMatches = this.data.matches.filter((m: any) => m.matchType === 'exactName').length;
    this.partialMatches = this.data.matches.filter((m: any) => m.matchType === 'partial').length;
    this.fuzzyMatches = this.data.matches.filter((m: any) => m.matchType === 'similar').length;
    this.unmatchedCount = this.data.unmatched?.length || 0;
    
    // Set up matches and unmatched arrays
    this.matches = this.data.matches.map((match: any) => ({
      customerName: match.orderStore.customerName,
      customerCode: match.orderStore.customerCode,
      totalItems: match.orderStore.totalItems,
      masterStore: match.masterStore,
      matchType: match.matchType
    }));
    
    this.unmatched = this.data.unmatched || [];
  }
  
  // Show manual match dialog for a store
  showManualMatchDialog(match: any): void {
    console.log('Opening manual match dialog for:', match);
    // Implementation for manual matching would go here
  }
  
  // Method to get match type label
  getMatchTypeLabel(matchType: string): string {
    switch (matchType) {
      case 'storeCode': return 'Store Code';
      case 'dispatch': return 'Dispatch Code';
      case 'address': return 'Address Match';
      case 'exactName': return 'Exact Name';
      case 'partial': return 'Partial Match';
      case 'similar': return 'Similar Name';
      case 'unmatched': return 'Unmatched';
      default: return matchType;
    }
  }
  
  // Method to get match type class
  getMatchTypeClass(matchType: string): string {
    switch (matchType) {
      case 'storeCode': return 'match-exact';
      case 'dispatch': return 'match-good';
      case 'address': return 'match-good';
      case 'exactName': return 'match-good';
      case 'partial': return 'match-medium';
      case 'similar': return 'match-fuzzy';
      default: return '';
    }
  }
  
  // Toggle route expansion
  toggleRouteExpand(routeName: string): void {
    if (this.expandedRoutes.has(routeName)) {
      this.expandedRoutes.delete(routeName);
    } else {
      this.expandedRoutes.add(routeName);
    }
  }
  
  // Check if a route is expanded
  isRouteExpanded(routeName: string): boolean {
    return this.expandedRoutes.has(routeName);
  }
} 