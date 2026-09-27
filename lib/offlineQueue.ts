"use client"

import { toast } from "@/hooks/use-toast";

/**
 * OfflineQueue: An enterprise utility to manage requests that failed due to network issues.
 * Retries them automatically when the browser comes back online.
 */

type QueuedRequest = {
  id: string;
  action: () => Promise<any>;
  description: string;
  timestamp: number;
};

class OfflineQueue {
  private queue: QueuedRequest[] = [];
  private isProcessing = false;

  constructor() {
    if (typeof window !== "undefined") {
      window.addEventListener("online", () => this.flush());
    }
  }

  public add(request: Omit<QueuedRequest, "id" | "timestamp">) {
    const id = Math.random().toString(36).substring(7);
    this.queue.push({ ...request, id, timestamp: Date.now() });
    
    toast({
      title: "Offline",
      description: `Action "${request.description}" queued and will retry when online.`,
    });
  }

  public async flush() {
    if (this.isProcessing || this.queue.length === 0) return;
    
    this.isProcessing = true;
    console.log(`[OfflineQueue] Flushing ${this.queue.length} requests…`);
    
    const remaining: QueuedRequest[] = [];
    
    for (const req of this.queue) {
      try {
        await req.action();
        console.log(`[OfflineQueue] Successfully processed: ${req.description}`);
      } catch (error) {
        console.error(`[OfflineQueue] Failed again: ${req.description}`, error);
        remaining.push(req);
      }
    }
    
    this.queue = remaining;
    this.isProcessing = false;

    if (this.queue.length === 0) {
      toast({
        title: "Back Online",
        description: "All pending actions have been synchronized.",
      });
    }
  }

  public getQueue() {
    return [...this.queue];
  }
}

export const offlineQueue = new OfflineQueue();
