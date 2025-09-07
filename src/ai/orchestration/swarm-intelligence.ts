/**
 * Swarm Intelligence System
 * Rapid, single-objective task execution using coordinated agent swarms
 */

import { EventEmitter } from 'events';
import * as crypto from 'crypto';

// Swarm agent behaviors
export enum SwarmBehavior {
  EXPLORE = 'explore',       // Search and discover
  EXPLOIT = 'exploit',       // Optimize found solutions
  CONVERGE = 'converge',     // Move toward best solution
  DIVERGE = 'diverge',       // Spread out to explore
  FOLLOW = 'follow',         // Follow leader/pheromone
  LEAD = 'lead',            // Guide other agents
  COMMUNICATE = 'communicate', // Share information
  ADAPT = 'adapt'           // Change strategy based on environment
}

// Swarm objectives
export enum SwarmObjective {
  SEARCH = 'search',
  OPTIMIZE = 'optimize',
  BUILD = 'build',
  ANALYZE = 'analyze',
  MIGRATE = 'migrate',
  DEFEND = 'defend',
  HARVEST = 'harvest',
  LEARN = 'learn'
}

interface SwarmAgent {
  id: string;
  position: Vector3D;
  velocity: Vector3D;
  behavior: SwarmBehavior;
  fitness: number;
  energy: number;
  memory: any[];
  neighbors: string[];
  pheromoneStrength: number;
}

interface Vector3D {
  x: number;
  y: number;
  z: number;
}

interface SwarmTask {
  id: string;
  objective: SwarmObjective;
  target: any;
  constraints: {
    timeLimit: number;
    energyBudget: number;
    qualityThreshold: number;
  };
  searchSpace: SearchSpace;
  fitnessFunction: (agent: SwarmAgent, target: any) => number;
}

interface SearchSpace {
  dimensions: number;
  bounds: {
    min: Vector3D;
    max: Vector3D;
  };
  obstacles: Obstacle[];
  attractors: Attractor[];
}

interface Obstacle {
  position: Vector3D;
  radius: number;
  penalty: number;
}

interface Attractor {
  position: Vector3D;
  strength: number;
  type: 'goal' | 'resource' | 'information';
}

interface SwarmSolution {
  id: string;
  taskId: string;
  solution: any;
  fitness: number;
  iterations: number;
  convergenceTime: number;
  energyUsed: number;
  agentsUsed: number;
}

interface PheromoneMap {
  grid: number[][][];
  evaporationRate: number;
  diffusionRate: number;
}

export class SwarmIntelligence extends EventEmitter {
  private agents: Map<string, SwarmAgent> = new Map();
  private tasks: Map<string, SwarmTask> = new Map();
  private solutions: Map<string, SwarmSolution> = new Map();
  private pheromoneMap: PheromoneMap;
  private globalBest: { position: Vector3D; fitness: number } | null = null;
  private iteration: number = 0;
  private isRunning: boolean = false;
  
  // Swarm parameters
  private readonly config = {
    swarmSize: 100,
    inertiaWeight: 0.7,
    cognitiveWeight: 1.5,
    socialWeight: 1.5,
    maxVelocity: 10,
    neighborhoodSize: 5,
    pheromoneImportance: 0.8,
    explorationRate: 0.2,
    convergenceThreshold: 0.001,
    maxIterations: 1000
  };
  
  constructor() {
    super();
    this.initializePheromoneMap();
  }
  
  private initializePheromoneMap(): void {
    const gridSize = 100;
    this.pheromoneMap = {
      grid: Array(gridSize).fill(0).map(() =>
        Array(gridSize).fill(0).map(() =>
          Array(gridSize).fill(0)
        )
      ),
      evaporationRate: 0.05,
      diffusionRate: 0.1
    };
  }
  
  // Initialize swarm for a task
  async deploySwarm(task: SwarmTask): Promise<SwarmSolution> {
    this.emit('swarm:deploying', { taskId: task.id, objective: task.objective });
    
    // Store task
    this.tasks.set(task.id, task);
    
    // Initialize agents
    this.initializeAgents(task);
    
    // Start swarm execution
    this.isRunning = true;
    this.iteration = 0;
    this.globalBest = null;
    
    const startTime = Date.now();
    const solution = await this.executeSwarm(task);
    const endTime = Date.now();
    
    // Create solution record
    const swarmSolution: SwarmSolution = {
      id: crypto.randomUUID(),
      taskId: task.id,
      solution: solution.data,
      fitness: solution.fitness,
      iterations: this.iteration,
      convergenceTime: endTime - startTime,
      energyUsed: this.calculateEnergyUsed(),
      agentsUsed: this.agents.size
    };
    
    this.solutions.set(swarmSolution.id, swarmSolution);
    
    this.emit('swarm:completed', swarmSolution);
    
    return swarmSolution;
  }
  
  private initializeAgents(task: SwarmTask): void {
    this.agents.clear();
    
    for (let i = 0; i < this.config.swarmSize; i++) {
      const agent: SwarmAgent = {
        id: `agent_${i}`,
        position: this.randomPosition(task.searchSpace),
        velocity: this.randomVelocity(),
        behavior: this.selectInitialBehavior(task.objective),
        fitness: 0,
        energy: 100,
        memory: [],
        neighbors: [],
        pheromoneStrength: 1.0
      };
      
      // Evaluate initial fitness
      agent.fitness = task.fitnessFunction(agent, task.target);
      
      this.agents.set(agent.id, agent);
    }
    
    // Establish neighborhoods
    this.updateNeighborhoods();
  }
  
  private async executeSwarm(task: SwarmTask): Promise<any> {
    while (this.isRunning && this.iteration < this.config.maxIterations) {
      this.iteration++;
      
      // Update each agent
      for (const agent of this.agents.values()) {
        if (agent.energy <= 0) continue;
        
        // Update behavior based on environment
        this.updateBehavior(agent, task);
        
        // Move agent
        this.moveAgent(agent, task);
        
        // Evaluate fitness
        agent.fitness = task.fitnessFunction(agent, task.target);
        
        // Update pheromones
        this.depositPheromone(agent);
        
        // Update global best
        this.updateGlobalBest(agent);
        
        // Consume energy
        agent.energy -= 0.1;
      }
      
      // Update pheromone map
      this.updatePheromoneMap();
      
      // Update neighborhoods
      if (this.iteration % 10 === 0) {
        this.updateNeighborhoods();
      }
      
      // Check convergence
      if (this.checkConvergence(task)) {
        this.isRunning = false;
      }
      
      // Emit progress
      if (this.iteration % 10 === 0) {
        this.emit('swarm:progress', {
          iteration: this.iteration,
          bestFitness: this.globalBest?.fitness || 0,
          avgEnergy: this.getAverageEnergy()
        });
      }
      
      // Small delay for async operations
      await new Promise(resolve => setImmediate(resolve));
    }
    
    return {
      data: this.globalBest?.position || null,
      fitness: this.globalBest?.fitness || 0
    };
  }
  
  private updateBehavior(agent: SwarmAgent, task: SwarmTask): void {
    // Adaptive behavior selection based on situation
    const localDensity = this.calculateLocalDensity(agent);
    const progressRate = this.calculateProgressRate();
    
    if (progressRate < 0.01 && this.iteration > 100) {
      // Stagnation - increase exploration
      agent.behavior = Math.random() < 0.5 ? SwarmBehavior.EXPLORE : SwarmBehavior.DIVERGE;
    } else if (localDensity > 0.7) {
      // Crowded - diverge
      agent.behavior = SwarmBehavior.DIVERGE;
    } else if (agent.fitness > this.getAverageFitness() * 1.2) {
      // Good solution - exploit
      agent.behavior = SwarmBehavior.EXPLOIT;
    } else if (this.globalBest && agent.fitness < this.globalBest.fitness * 0.5) {
      // Poor performance - follow better agents
      agent.behavior = SwarmBehavior.FOLLOW;
    } else {
      // Normal exploration/exploitation balance
      agent.behavior = Math.random() < this.config.explorationRate 
        ? SwarmBehavior.EXPLORE 
        : SwarmBehavior.CONVERGE;
    }
  }
  
  private moveAgent(agent: SwarmAgent, task: SwarmTask): void {
    switch (agent.behavior) {
      case SwarmBehavior.EXPLORE:
        this.exploreMove(agent, task.searchSpace);
        break;
      
      case SwarmBehavior.EXPLOIT:
        this.exploitMove(agent, task.searchSpace);
        break;
      
      case SwarmBehavior.CONVERGE:
        this.convergeMove(agent, task.searchSpace);
        break;
      
      case SwarmBehavior.DIVERGE:
        this.divergeMove(agent, task.searchSpace);
        break;
      
      case SwarmBehavior.FOLLOW:
        this.followMove(agent, task.searchSpace);
        break;
      
      default:
        this.standardMove(agent, task.searchSpace);
    }
    
    // Apply constraints
    this.applyConstraints(agent, task.searchSpace);
  }
  
  private exploreMove(agent: SwarmAgent, space: SearchSpace): void {
    // Random exploration with Lévy flight
    const levyStep = this.generateLevyStep();
    
    agent.velocity = {
      x: agent.velocity.x * this.config.inertiaWeight + levyStep.x,
      y: agent.velocity.y * this.config.inertiaWeight + levyStep.y,
      z: agent.velocity.z * this.config.inertiaWeight + levyStep.z
    };
    
    this.updatePosition(agent);
  }
  
  private exploitMove(agent: SwarmAgent, space: SearchSpace): void {
    // Move toward personal best with small perturbations
    const personalBest = this.getPersonalBest(agent);
    
    if (personalBest) {
      const cognitive = this.vectorScale(
        this.vectorSubtract(personalBest, agent.position),
        this.config.cognitiveWeight * Math.random()
      );
      
      agent.velocity = this.vectorAdd(
        this.vectorScale(agent.velocity, this.config.inertiaWeight),
        cognitive
      );
    }
    
    this.updatePosition(agent);
  }
  
  private convergeMove(agent: SwarmAgent, space: SearchSpace): void {
    // PSO-style movement toward global and personal best
    const personalBest = this.getPersonalBest(agent);
    
    if (this.globalBest && personalBest) {
      const cognitive = this.vectorScale(
        this.vectorSubtract(personalBest, agent.position),
        this.config.cognitiveWeight * Math.random()
      );
      
      const social = this.vectorScale(
        this.vectorSubtract(this.globalBest.position, agent.position),
        this.config.socialWeight * Math.random()
      );
      
      agent.velocity = this.vectorAdd(
        this.vectorScale(agent.velocity, this.config.inertiaWeight),
        this.vectorAdd(cognitive, social)
      );
    }
    
    this.updatePosition(agent);
  }
  
  private divergeMove(agent: SwarmAgent, space: SearchSpace): void {
    // Move away from neighbors to explore new areas
    const repulsion = this.calculateRepulsion(agent);
    
    agent.velocity = this.vectorAdd(
      this.vectorScale(agent.velocity, this.config.inertiaWeight),
      repulsion
    );
    
    this.updatePosition(agent);
  }
  
  private followMove(agent: SwarmAgent, space: SearchSpace): void {
    // Follow pheromone trails and successful neighbors
    const pheromoneGradient = this.calculatePheromoneGradient(agent.position);
    const neighborBest = this.getBestNeighbor(agent);
    
    if (neighborBest) {
      const follow = this.vectorScale(
        this.vectorSubtract(neighborBest.position, agent.position),
        this.config.socialWeight * Math.random()
      );
      
      const pheromone = this.vectorScale(
        pheromoneGradient,
        this.config.pheromoneImportance
      );
      
      agent.velocity = this.vectorAdd(
        this.vectorScale(agent.velocity, this.config.inertiaWeight),
        this.vectorAdd(follow, pheromone)
      );
    }
    
    this.updatePosition(agent);
  }
  
  private standardMove(agent: SwarmAgent, space: SearchSpace): void {
    // Standard PSO movement
    this.convergeMove(agent, space);
  }
  
  private updatePosition(agent: SwarmAgent): void {
    // Limit velocity
    const speed = this.vectorMagnitude(agent.velocity);
    if (speed > this.config.maxVelocity) {
      agent.velocity = this.vectorScale(
        agent.velocity,
        this.config.maxVelocity / speed
      );
    }
    
    // Update position
    agent.position = this.vectorAdd(agent.position, agent.velocity);
    
    // Store in memory
    agent.memory.push({
      position: { ...agent.position },
      fitness: agent.fitness,
      iteration: this.iteration
    });
    
    // Keep memory size limited
    if (agent.memory.length > 50) {
      agent.memory.shift();
    }
  }
  
  private applyConstraints(agent: SwarmAgent, space: SearchSpace): void {
    // Boundary constraints
    agent.position.x = Math.max(space.bounds.min.x, 
                       Math.min(space.bounds.max.x, agent.position.x));
    agent.position.y = Math.max(space.bounds.min.y, 
                       Math.min(space.bounds.max.y, agent.position.y));
    agent.position.z = Math.max(space.bounds.min.z, 
                       Math.min(space.bounds.max.z, agent.position.z));
    
    // Obstacle avoidance
    for (const obstacle of space.obstacles) {
      const distance = this.vectorDistance(agent.position, obstacle.position);
      if (distance < obstacle.radius) {
        // Push agent away from obstacle
        const push = this.vectorScale(
          this.vectorSubtract(agent.position, obstacle.position),
          obstacle.radius / distance
        );
        agent.position = this.vectorAdd(agent.position, push);
        agent.fitness -= obstacle.penalty;
      }
    }
    
    // Attractor influence
    for (const attractor of space.attractors) {
      const distance = this.vectorDistance(agent.position, attractor.position);
      const influence = attractor.strength / (1 + distance);
      
      const pull = this.vectorScale(
        this.vectorSubtract(attractor.position, agent.position),
        influence * 0.1
      );
      
      agent.velocity = this.vectorAdd(agent.velocity, pull);
    }
  }
  
  private depositPheromone(agent: SwarmAgent): void {
    const gridPos = this.worldToGrid(agent.position);
    
    if (this.isValidGridPosition(gridPos)) {
      const strength = agent.fitness * agent.pheromoneStrength;
      this.pheromoneMap.grid[gridPos.x][gridPos.y][gridPos.z] += strength;
    }
  }
  
  private updatePheromoneMap(): void {
    const { grid, evaporationRate, diffusionRate } = this.pheromoneMap;
    const size = grid.length;
    
    // Create temporary grid for diffusion
    const newGrid = JSON.parse(JSON.stringify(grid));
    
    for (let x = 0; x < size; x++) {
      for (let y = 0; y < size; y++) {
        for (let z = 0; z < size; z++) {
          // Evaporation
          newGrid[x][y][z] *= (1 - evaporationRate);
          
          // Diffusion to neighbors
          const neighbors = this.getGridNeighbors(x, y, z);
          for (const [nx, ny, nz] of neighbors) {
            if (this.isValidGridIndex(nx, ny, nz)) {
              newGrid[nx][ny][nz] += grid[x][y][z] * diffusionRate / neighbors.length;
            }
          }
        }
      }
    }
    
    this.pheromoneMap.grid = newGrid;
  }
  
  private calculatePheromoneGradient(position: Vector3D): Vector3D {
    const gridPos = this.worldToGrid(position);
    
    if (!this.isValidGridPosition(gridPos)) {
      return { x: 0, y: 0, z: 0 };
    }
    
    const gradient = { x: 0, y: 0, z: 0 };
    const neighbors = this.getGridNeighbors(gridPos.x, gridPos.y, gridPos.z);
    
    for (const [nx, ny, nz] of neighbors) {
      if (this.isValidGridIndex(nx, ny, nz)) {
        const diff = this.pheromoneMap.grid[nx][ny][nz] - 
                    this.pheromoneMap.grid[gridPos.x][gridPos.y][gridPos.z];
        
        gradient.x += (nx - gridPos.x) * diff;
        gradient.y += (ny - gridPos.y) * diff;
        gradient.z += (nz - gridPos.z) * diff;
      }
    }
    
    return this.vectorNormalize(gradient);
  }
  
  private updateNeighborhoods(): void {
    const agentArray = Array.from(this.agents.values());
    
    for (const agent of agentArray) {
      // Find k-nearest neighbors
      const distances = agentArray
        .filter(a => a.id !== agent.id)
        .map(a => ({
          id: a.id,
          distance: this.vectorDistance(agent.position, a.position)
        }))
        .sort((a, b) => a.distance - b.distance);
      
      agent.neighbors = distances
        .slice(0, this.config.neighborhoodSize)
        .map(d => d.id);
    }
  }
  
  private updateGlobalBest(agent: SwarmAgent): void {
    if (!this.globalBest || agent.fitness > this.globalBest.fitness) {
      this.globalBest = {
        position: { ...agent.position },
        fitness: agent.fitness
      };
      
      this.emit('swarm:new-best', this.globalBest);
    }
  }
  
  private checkConvergence(task: SwarmTask): boolean {
    // Check if swarm has converged
    if (!this.globalBest) return false;
    
    // Check if quality threshold is met
    if (this.globalBest.fitness >= task.constraints.qualityThreshold) {
      return true;
    }
    
    // Check if swarm is stagnant
    const progressRate = this.calculateProgressRate();
    if (progressRate < this.config.convergenceThreshold && this.iteration > 100) {
      return true;
    }
    
    // Check energy budget
    const totalEnergy = Array.from(this.agents.values())
      .reduce((sum, agent) => sum + agent.energy, 0);
    
    if (totalEnergy < task.constraints.energyBudget * 0.1) {
      return true;
    }
    
    return false;
  }
  
  // Helper methods
  
  private randomPosition(space: SearchSpace): Vector3D {
    return {
      x: Math.random() * (space.bounds.max.x - space.bounds.min.x) + space.bounds.min.x,
      y: Math.random() * (space.bounds.max.y - space.bounds.min.y) + space.bounds.min.y,
      z: Math.random() * (space.bounds.max.z - space.bounds.min.z) + space.bounds.min.z
    };
  }
  
  private randomVelocity(): Vector3D {
    return {
      x: (Math.random() - 0.5) * 2,
      y: (Math.random() - 0.5) * 2,
      z: (Math.random() - 0.5) * 2
    };
  }
  
  private selectInitialBehavior(objective: SwarmObjective): SwarmBehavior {
    switch (objective) {
      case SwarmObjective.SEARCH:
        return SwarmBehavior.EXPLORE;
      case SwarmObjective.OPTIMIZE:
        return SwarmBehavior.EXPLOIT;
      case SwarmObjective.BUILD:
        return SwarmBehavior.CONVERGE;
      default:
        return SwarmBehavior.ADAPT;
    }
  }
  
  private calculateLocalDensity(agent: SwarmAgent): number {
    let nearbyCount = 0;
    const radius = 10;
    
    for (const other of this.agents.values()) {
      if (other.id !== agent.id) {
        const distance = this.vectorDistance(agent.position, other.position);
        if (distance < radius) {
          nearbyCount++;
        }
      }
    }
    
    return nearbyCount / this.agents.size;
  }
  
  private calculateProgressRate(): number {
    if (!this.globalBest || agent.memory.length < 10) return 1;
    
    const recentHistory = agent.memory.slice(-10);
    const oldFitness = recentHistory[0].fitness;
    const newFitness = recentHistory[recentHistory.length - 1].fitness;
    
    return Math.abs(newFitness - oldFitness) / (oldFitness + 0.0001);
  }
  
  private getAverageFitness(): number {
    const total = Array.from(this.agents.values())
      .reduce((sum, agent) => sum + agent.fitness, 0);
    
    return total / this.agents.size;
  }
  
  private getAverageEnergy(): number {
    const total = Array.from(this.agents.values())
      .reduce((sum, agent) => sum + agent.energy, 0);
    
    return total / this.agents.size;
  }
  
  private getPersonalBest(agent: SwarmAgent): Vector3D | null {
    if (agent.memory.length === 0) return null;
    
    let best = agent.memory[0];
    for (const memory of agent.memory) {
      if (memory.fitness > best.fitness) {
        best = memory;
      }
    }
    
    return best.position;
  }
  
  private getBestNeighbor(agent: SwarmAgent): SwarmAgent | null {
    let best: SwarmAgent | null = null;
    let bestFitness = -Infinity;
    
    for (const neighborId of agent.neighbors) {
      const neighbor = this.agents.get(neighborId);
      if (neighbor && neighbor.fitness > bestFitness) {
        best = neighbor;
        bestFitness = neighbor.fitness;
      }
    }
    
    return best;
  }
  
  private calculateRepulsion(agent: SwarmAgent): Vector3D {
    const repulsion = { x: 0, y: 0, z: 0 };
    
    for (const neighborId of agent.neighbors) {
      const neighbor = this.agents.get(neighborId);
      if (neighbor) {
        const diff = this.vectorSubtract(agent.position, neighbor.position);
        const distance = this.vectorMagnitude(diff);
        
        if (distance > 0) {
          const force = this.vectorScale(diff, 1 / (distance * distance));
          repulsion.x += force.x;
          repulsion.y += force.y;
          repulsion.z += force.z;
        }
      }
    }
    
    return repulsion;
  }
  
  private generateLevyStep(): Vector3D {
    // Lévy flight step generation
    const beta = 1.5;
    const sigma = Math.pow(
      (gamma(1 + beta) * Math.sin(Math.PI * beta / 2)) /
      (gamma((1 + beta) / 2) * beta * Math.pow(2, (beta - 1) / 2)),
      1 / beta
    );
    
    const u = this.randomNormal() * sigma;
    const v = this.randomNormal();
    const step = u / Math.pow(Math.abs(v), 1 / beta);
    
    return {
      x: step * this.randomNormal(),
      y: step * this.randomNormal(),
      z: step * this.randomNormal()
    };
  }
  
  private randomNormal(): number {
    // Box-Muller transform for normal distribution
    const u1 = Math.random();
    const u2 = Math.random();
    return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  }
  
  private calculateEnergyUsed(): number {
    const initialEnergy = this.config.swarmSize * 100;
    const currentEnergy = Array.from(this.agents.values())
      .reduce((sum, agent) => sum + agent.energy, 0);
    
    return initialEnergy - currentEnergy;
  }
  
  // Vector operations
  
  private vectorAdd(a: Vector3D, b: Vector3D): Vector3D {
    return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z };
  }
  
  private vectorSubtract(a: Vector3D, b: Vector3D): Vector3D {
    return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
  }
  
  private vectorScale(v: Vector3D, scalar: number): Vector3D {
    return { x: v.x * scalar, y: v.y * scalar, z: v.z * scalar };
  }
  
  private vectorMagnitude(v: Vector3D): number {
    return Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z);
  }
  
  private vectorDistance(a: Vector3D, b: Vector3D): number {
    return this.vectorMagnitude(this.vectorSubtract(a, b));
  }
  
  private vectorNormalize(v: Vector3D): Vector3D {
    const mag = this.vectorMagnitude(v);
    if (mag === 0) return { x: 0, y: 0, z: 0 };
    return this.vectorScale(v, 1 / mag);
  }
  
  // Grid operations
  
  private worldToGrid(position: Vector3D): { x: number; y: number; z: number } {
    const gridSize = this.pheromoneMap.grid.length;
    return {
      x: Math.floor((position.x + 50) / 100 * gridSize),
      y: Math.floor((position.y + 50) / 100 * gridSize),
      z: Math.floor((position.z + 50) / 100 * gridSize)
    };
  }
  
  private isValidGridPosition(pos: { x: number; y: number; z: number }): boolean {
    return this.isValidGridIndex(pos.x, pos.y, pos.z);
  }
  
  private isValidGridIndex(x: number, y: number, z: number): boolean {
    const size = this.pheromoneMap.grid.length;
    return x >= 0 && x < size && y >= 0 && y < size && z >= 0 && z < size;
  }
  
  private getGridNeighbors(x: number, y: number, z: number): number[][] {
    const neighbors = [];
    
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        for (let dz = -1; dz <= 1; dz++) {
          if (dx !== 0 || dy !== 0 || dz !== 0) {
            neighbors.push([x + dx, y + dy, z + dz]);
          }
        }
      }
    }
    
    return neighbors;
  }
  
  // Public API
  
  getSwarmStatus(): any {
    return {
      isRunning: this.isRunning,
      iteration: this.iteration,
      swarmSize: this.agents.size,
      globalBest: this.globalBest,
      averageFitness: this.getAverageFitness(),
      averageEnergy: this.getAverageEnergy()
    };
  }
  
  stopSwarm(): void {
    this.isRunning = false;
  }
  
  getAgents(): SwarmAgent[] {
    return Array.from(this.agents.values());
  }
  
  getSolutions(): SwarmSolution[] {
    return Array.from(this.solutions.values());
  }
}

// Gamma function approximation for Lévy flight
function gamma(z: number): number {
  const g = 7;
  const C = [
    0.99999999999980993,
    676.5203681218851,
    -1259.1392167224028,
    771.32342877765313,
    -176.61502916214059,
    12.507343278686905,
    -0.13857109526572012,
    9.9843695780195716e-6,
    1.5056327351493116e-7
  ];
  
  if (z < 0.5) {
    return Math.PI / (Math.sin(Math.PI * z) * gamma(1 - z));
  }
  
  z -= 1;
  let x = C[0];
  for (let i = 1; i < g + 2; i++) {
    x += C[i] / (z + i);
  }
  
  const t = z + g + 0.5;
  return Math.sqrt(2 * Math.PI) * Math.pow(t, z + 0.5) * Math.exp(-t) * x;
}

// Export singleton instance
export const swarmIntelligence = new SwarmIntelligence();