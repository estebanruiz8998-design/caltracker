export interface FoodItem {
  name: string;
  quantity: string;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
}

export interface FoodAnalysis {
  is_food: boolean;
  food_name: string;
  emoji: string;
  items: FoodItem[];
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  health_score: number; // 1-10
  confidence: "low" | "medium" | "high";
  notes: string;
}

export interface FoodLog {
  id: string;
  /** Local date key: YYYY-MM-DD */
  date: string;
  /** Epoch ms when logged */
  loggedAt: number;
  name: string;
  emoji: string;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  health_score: number;
  items: FoodItem[];
  /** Downscaled JPEG data URL of the scanned photo (optional) */
  photo?: string;
}

export type Sex = "male" | "female";
export type Activity = "sedentary" | "light" | "moderate" | "active" | "very_active";
export type GoalType = "lose" | "maintain" | "gain";

export interface Profile {
  sex: Sex;
  age: number;
  heightCm: number;
  weightKg: number;
  activity: Activity;
  goal: GoalType;
}

export interface Goals {
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
}
