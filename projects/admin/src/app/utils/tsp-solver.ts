/**
 * Basic implementation of a TSP solver
 * Using nearest neighbor algorithm and 2-opt improvement
 */

export interface TspLocation {
  lat: number;
  lng: number;
  name?: string;
  openingTime?: Date;
}

export interface TspOptions {
  considerOpeningTimes?: boolean;
  startTime?: Date;
}

/**
 * Solves the TSP problem using nearest neighbor algorithm
 * @param locations Array of lat/lng locations
 * @param distanceMatrix Distance matrix between locations
 * @param startLocationIndex Index of starting location (default: 0)
 * @param options Additional options for solving
 * @returns Ordered array of indexes representing the route
 */
export function solveTsp(
  locations: TspLocation[],
  distanceMatrix: number[][],
  startLocationIndex: number = 0,
  options: TspOptions = {}
): number[] {
  if (locations.length <= 1) {
    return locations.length === 1 ? [0] : [];
  }

  const n = locations.length;
  const visited = new Array(n).fill(false);
  const route: number[] = [];
  
  // Start with the first location (or specified start location)
  let currentLocationIndex = startLocationIndex;
  route.push(currentLocationIndex);
  visited[currentLocationIndex] = true;
  
  // Process opening times if needed
  const { considerOpeningTimes, startTime } = options;
  let currentTime = startTime ? new Date(startTime) : new Date();
  
  // Visit each remaining location
  for (let i = 1; i < n; i++) {
    let nextLocationIndex = -1;
    let minDistance = Infinity;
    
    // Find the nearest unvisited location
    for (let j = 0; j < n; j++) {
      if (!visited[j]) {
        let distance = distanceMatrix[currentLocationIndex][j];
        
        if (considerOpeningTimes && locations[j].openingTime) {
          // Estimate arrival time
          const travelTimeMs = distance * 1000; // Convert to milliseconds
          const estimatedArrival = new Date(currentTime.getTime() + travelTimeMs);
          
          // If we would arrive before opening, add penalty
          if (estimatedArrival < locations[j].openingTime!) {
            const waitTimeMs = locations[j].openingTime!.getTime() - estimatedArrival.getTime();
            distance += waitTimeMs / 1000; // Add wait time as distance penalty
          }
        }
        
        if (distance < minDistance) {
          minDistance = distance;
          nextLocationIndex = j;
        }
      }
    }
    
    if (nextLocationIndex !== -1) {
      // Update current time (simulate travel)
      if (considerOpeningTimes) {
        const travelTimeMs = distanceMatrix[currentLocationIndex][nextLocationIndex] * 1000;
        currentTime = new Date(currentTime.getTime() + travelTimeMs);
        
        // Wait for opening if needed
        if (locations[nextLocationIndex].openingTime && currentTime < locations[nextLocationIndex].openingTime!) {
          currentTime = new Date(locations[nextLocationIndex].openingTime!);
        }
        
        // Add service time (e.g., 15 minutes at each stop)
        currentTime = new Date(currentTime.getTime() + 15 * 60 * 1000);
      }
      
      route.push(nextLocationIndex);
      visited[nextLocationIndex] = true;
      currentLocationIndex = nextLocationIndex;
    }
  }
  
  return route;
}

/**
 * Calculates distance between two points using the Haversine formula
 */
export function calculateDistance(
  lat1: number, 
  lng1: number, 
  lat2: number, 
  lng2: number
): number {
  const R = 6371; // Earth's radius in km
  const dLat = toRadians(lat2 - lat1);
  const dLng = toRadians(lng2 - lng1);
  
  const a = 
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) * 
    Math.sin(dLng / 2) * Math.sin(dLng / 2);
  
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const distance = R * c;
  
  return distance;
}

/**
 * Converts degrees to radians
 */
function toRadians(degrees: number): number {
  return degrees * Math.PI / 180;
}

/**
 * Apply 2-opt improvement to a given route
 */
export function improve2Opt(
  route: number[],
  distanceMatrix: number[][]
): number[] {
  if (route.length <= 3) return [...route];
  
  const improved = [...route];
  let improved_distance = calculateRouteDistance(improved, distanceMatrix);
  let iterations_without_improvement = 0;
  
  while (iterations_without_improvement < 10) {
    let best_distance = improved_distance;
    let best_i = -1;
    let best_j = -1;
    
    // Check all possible 2-opt swaps
    for (let i = 0; i < improved.length - 2; i++) {
      for (let j = i + 2; j < improved.length - (i === 0 ? 1 : 0); j++) {
        // Create new route with 2-opt swap
        const new_route = [...improved];
        reverseSegment(new_route, i + 1, j);
        
        // Calculate new distance
        const new_distance = calculateRouteDistance(new_route, distanceMatrix);
        
        // Update if better
        if (new_distance < best_distance) {
          best_distance = new_distance;
          best_i = i + 1;
          best_j = j;
        }
      }
    }
    
    // Apply best improvement if found
    if (best_i !== -1) {
      reverseSegment(improved, best_i, best_j);
      improved_distance = best_distance;
      iterations_without_improvement = 0;
    } else {
      iterations_without_improvement++;
    }
  }
  
  return improved;
}

/**
 * Helper function to reverse a segment of an array in-place
 */
function reverseSegment(route: number[], i: number, j: number): void {
  while (i < j) {
    [route[i], route[j]] = [route[j], route[i]];
    i++;
    j--;
  }
}

/**
 * Helper function to calculate the total distance of a route
 */
function calculateRouteDistance(route: number[], distanceMatrix: number[][]): number {
  let distance = 0;
  
  for (let i = 0; i < route.length - 1; i++) {
    distance += distanceMatrix[route[i]][route[i + 1]];
  }
  
  return distance;
} 