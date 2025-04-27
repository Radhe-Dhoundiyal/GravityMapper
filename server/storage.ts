import { anomalyPoints, type AnomalyPoint, type InsertAnomalyPoint, users, type User, type InsertUser } from "@shared/schema";

// modify the interface with any CRUD methods
// you might need

export interface IStorage {
  getUser(id: number): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  
  // Anomaly points methods
  getAllAnomalyPoints(): Promise<AnomalyPoint[]>;
  getAnomalyPointById(id: number): Promise<AnomalyPoint | undefined>;
  createAnomalyPoint(point: InsertAnomalyPoint): Promise<AnomalyPoint>;
  clearAllAnomalyPoints(): Promise<void>;
}

export class MemStorage implements IStorage {
  private users: Map<number, User>;
  private anomalyPoints: Map<number, AnomalyPoint>;
  private userCurrentId: number;
  private anomalyCurrentId: number;

  constructor() {
    this.users = new Map();
    this.anomalyPoints = new Map();
    this.userCurrentId = 1;
    this.anomalyCurrentId = 1;
  }

  async getUser(id: number): Promise<User | undefined> {
    return this.users.get(id);
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    return Array.from(this.users.values()).find(
      (user) => user.username === username,
    );
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const id = this.userCurrentId++;
    const user: User = { ...insertUser, id };
    this.users.set(id, user);
    return user;
  }

  async getAllAnomalyPoints(): Promise<AnomalyPoint[]> {
    return Array.from(this.anomalyPoints.values());
  }

  async getAnomalyPointById(id: number): Promise<AnomalyPoint | undefined> {
    return this.anomalyPoints.get(id);
  }

  async createAnomalyPoint(insertPoint: InsertAnomalyPoint): Promise<AnomalyPoint> {
    const id = this.anomalyCurrentId++;
    const timestamp = insertPoint.timestamp || new Date();
    const point: AnomalyPoint = { 
      ...insertPoint, 
      id,
      timestamp 
    };
    this.anomalyPoints.set(id, point);
    return point;
  }

  async clearAllAnomalyPoints(): Promise<void> {
    this.anomalyPoints.clear();
  }
}

export const storage = new MemStorage();
