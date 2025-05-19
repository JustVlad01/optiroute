/**
 * TSP Solver utility for route optimization
 * Implements multiple algorithms for solving the Traveling Salesman Problem
 */

/**
 * Interface for a location with optional priority and time windows
 */
export interface TspLocation {
  index: number;
  priority?: boolean;
  openingTime?: Date;
  lat: number;
  lng: number;
}

/**
 * Options for the TSP solver
 */
export interface TspOptions {
  considerOpeningTimes?: boolean;
  considerPriorities?: boolean;
  startTime?: Date;
  averageStopDurationMinutes?: number;
}

/**
 * Solves the TSP using the nearest neighbor algorithm with enhancements
 * @param distanceMatrix A matrix of distances/travel times between all points
 * @param startNodeIndex The index of the starting node (-1 for no fixed start)
 * @param locations Information about each location (for priorities and time windows)
 * @param options Options for the solver algorithm
 * @returns Optimized route as array of location indices
 */
export function solveWithNearestNeighbor(
  distanceMatrix: number[][],
  startNodeIndex: number,
  locations: TspLocation[],
  options: TspOptions = {}
): number[] {
  const n = distanceMatrix.length;
  
  if (n <= 1) {
    return startNodeIndex >= 0 ? [startNodeIndex] : [];
  }
  
  // Default options
  const {
    considerOpeningTimes = false,
    considerPriorities = false,
    startTime = new Date(),
    averageStopDurationMinutes = 15
  } = options;
  
  // Set up visited and unvisited arrays
  const visited: number[] = [];
  let current: number;
  
  // Use provided start node or select node 0
  if (startNodeIndex >= 0 && startNodeIndex < n) {
    visited.push(startNodeIndex);
    current = startNodeIndex;
  } else {
    visited.push(0);
    current = 0;
  }
  
  // Create a list of unvisited points (exclude starting point)
  const unvisited: number[] = [];
  for (let i = 0; i < n; i++) {
    if (i !== current) {
      unvisited.push(i);
    }
  }
  
  // Sort unvisited based on priorities and opening times if needed
  if (considerPriorities || considerOpeningTimes) {
    unvisited.sort((a, b) => {
      const locA = locations.find(loc => loc.index === a);
      const locB = locations.find(loc => loc.index === b);
      
      // First sort by priority if enabled
      if (considerPriorities) {
        if (locA?.priority && !locB?.priority) return -1;
        if (!locA?.priority && locB?.priority) return 1;
      }
      
      // Then sort by opening time if enabled
      if (considerOpeningTimes) {
        if (locA?.openingTime && locB?.openingTime) {
          return locA.openingTime.getTime() - locB.openingTime.getTime();
        } else if (locA?.openingTime) {
          return -1; // A comes first
        } else if (locB?.openingTime) {
          return 1; // B comes first
        }
      }
      
      return 0;
    });
  }
  
  // For time-based calculations
  let currentTime = new Date(startTime);
  
  // Main nearest neighbor algorithm
  while (unvisited.length > 0) {
    let nearest = -1;
    let minDistance = Infinity;
    
    for (const point of unvisited) {
      // Get distance from current to this point
      const distance = distanceMatrix[current][point];
      
      // Consider opening times if enabled
      if (considerOpeningTimes) {
        const loc = locations.find(l => l.index === point);
        
        if (loc?.openingTime) {
          // Calculate estimated arrival time
          const travelTimeMs = distance * 60000; // Convert from minutes to ms
          const estimatedArrival = new Date(currentTime.getTime() + travelTimeMs);
          
          // Penalty for arriving before opening
          if (estimatedArrival < loc.openingTime) {
            const waitTimeMinutes = (loc.openingTime.getTime() - estimatedArrival.getTime()) / 60000;
            const adjustedDistance = distance + waitTimeMinutes * 0.5; // Apply wait time penalty
            
            if (adjustedDistance < minDistance) {
              minDistance = adjustedDistance;
              nearest = point;
            }
            continue;
          }
        }
      }
      
      // Priority nodes - if we're only considering priority nodes at this stage
      if (considerPriorities) {
        const priorityNodesRemain = unvisited.some(idx => {
          const loc = locations.find(l => l.index === idx);
          return loc?.priority;
        });
        
        if (priorityNodesRemain) {
          const loc = locations.find(l => l.index === point);
          // Skip non-priority nodes if priority nodes remain
          if (!loc?.priority) continue;
        }
      }
      
      if (distance < minDistance) {
        minDistance = distance;
        nearest = point;
      }
    }
    
    if (nearest !== -1) {
      // Add to visited and remove from unvisited
      visited.push(nearest);
      const index = unvisited.indexOf(nearest);
      unvisited.splice(index, 1);
      
      // Update current node
      current = nearest;
      
      // Update time for next calculation
      if (considerOpeningTimes) {
        // Add travel time to current time
        const travelTimeMs = distanceMatrix[visited[visited.length - 2]][current] * 60000;
        currentTime = new Date(currentTime.getTime() + travelTimeMs);
        
        // Add stop duration
        currentTime = new Date(currentTime.getTime() + averageStopDurationMinutes * 60000);
        
        // Check for opening time constraints
        const loc = locations.find(l => l.index === current);
        if (loc?.openingTime && currentTime < loc.openingTime) {
          // Wait until opening time
          currentTime = new Date(loc.openingTime);
        }
      }
    }
  }
  
  return visited;
}

/**
 * Solves the TSP using the 2-opt improvement algorithm
 * This improves on an existing route by checking if swapping edges reduces total distance
 * @param route Initial route
 * @param distanceMatrix Distance/duration matrix
 * @returns Improved route
 */
export function improve2Opt(route: number[], distanceMatrix: number[][]): number[] {
  let improved = true;
  let bestDistance = calculateRouteDistance(route, distanceMatrix);
  let bestRoute = [...route];
  
  while (improved) {
    improved = false;
    
    for (let i = 1; i < route.length - 1; i++) {
      for (let j = i + 1; j < route.length; j++) {
        // Skip adjacent edges
        if (j - i <= 1) continue;
        
        // Create a new route with the edges between i and j reversed
        const newRoute = [...bestRoute];
        // Reverse the segment from i to j
        const segment = newRoute.slice(i, j + 1).reverse();
        newRoute.splice(i, segment.length, ...segment);
        
        // Calculate the distance of the new route
        const newDistance = calculateRouteDistance(newRoute, distanceMatrix);
        
        // If the new route is shorter, keep it
        if (newDistance < bestDistance) {
          bestDistance = newDistance;
          bestRoute = newRoute;
          improved = true;
          // Restart from the beginning with the new best route
          break;
        }
      }
      if (improved) break;
    }
  }
  
  return bestRoute;
}

/**
 * Calculate the total distance/duration of a route
 */
function calculateRouteDistance(route: number[], distanceMatrix: number[][]): number {
  let totalDistance = 0;
  
  for (let i = 0; i < route.length - 1; i++) {
    totalDistance += distanceMatrix[route[i]][route[i + 1]];
  }
  
  return totalDistance;
}

/**
 * Comprehensive TSP solver that combines multiple algorithms
 * 1. Generate an initial solution with Nearest Neighbor
 * 2. Improve it with 2-opt
 */
export function solveTsp(
  distanceMatrix: number[][],
  startNodeIndex: number,
  locations: TspLocation[],
  options: TspOptions = {}
): number[] {
  // Get initial solution with nearest neighbor
  const initialRoute = solveWithNearestNeighbor(
    distanceMatrix,
    startNodeIndex,
    locations,
    options
  );
  
  // Improve solution with 2-opt
  return improve2Opt(initialRoute, distanceMatrix);
} 