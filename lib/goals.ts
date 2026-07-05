import type { Activity, Goals, GoalType, Profile } from "./types";

const ACTIVITY_MULTIPLIER: Record<Activity, number> = {
  sedentary: 1.2,
  light: 1.375,
  moderate: 1.55,
  active: 1.725,
  very_active: 1.9,
};

const GOAL_ADJUSTMENT: Record<GoalType, number> = {
  lose: -500,
  maintain: 0,
  gain: 400,
};

/**
 * Mifflin-St Jeor BMR -> TDEE -> goal-adjusted calories, with a
 * 30% protein / 40% carbs / 30% fat macro split (Cal AI-style defaults).
 */
export function computeGoals(profile: Profile): Goals {
  const { sex, age, heightCm, weightKg, activity, goal } = profile;
  const bmr =
    10 * weightKg + 6.25 * heightCm - 5 * age + (sex === "male" ? 5 : -161);
  const tdee = bmr * ACTIVITY_MULTIPLIER[activity];
  const calories = Math.max(1200, Math.round(tdee + GOAL_ADJUSTMENT[goal]));
  return {
    calories,
    protein_g: Math.round((calories * 0.3) / 4),
    carbs_g: Math.round((calories * 0.4) / 4),
    fat_g: Math.round((calories * 0.3) / 9),
  };
}

export const DEFAULT_GOALS: Goals = {
  calories: 2000,
  protein_g: 150,
  carbs_g: 200,
  fat_g: 67,
};
