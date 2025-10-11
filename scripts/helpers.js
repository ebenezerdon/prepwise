/* scripts/helpers.js
   Responsibility: persistent storage, id generation, basic scheduling utilities.
   Exposes window.AppStorage and window.AppUtils for use by UI module.
*/
(function(window, $){
  'use strict';

  const KEY = 'prepwise:v1';

  // Simple deterministic id generator
  function uid(prefix = 'id'){
    return `${prefix}_${Date.now().toString(36)}_${Math.floor(Math.random()*9000+1000).toString(36)}`;
  }

  // Load/save planner state
  function save(state){
    try{
      const raw = JSON.stringify(state);
      window.localStorage.setItem(KEY, raw);
      return true;
    }catch(e){
      console.error('Save failed', e);
      return false;
    }
  }

  function load(){
    try{
      const raw = window.localStorage.getItem(KEY);
      if(!raw) return null;
      return JSON.parse(raw);
    }catch(e){
      console.error('Load failed', e);
      return null;
    }
  }

  function clear(){
    window.localStorage.removeItem(KEY);
  }

  // Small helper to deep clone simple objects
  function clone(obj){
    return JSON.parse(JSON.stringify(obj));
  }

  /* Basic distribution algorithm:
     - Input: list of dishes {id,name,totalServings,servingSize}
     - We attempt to allocate meal slots across 7 days * 4 meals = 28 slots
     - We prefer spreading a dish across non-consecutive days if possible
     - Leftovers are handled implicitly by remaining servings
  */
  function distribute(dishes, existingPlan){
    // existingPlan is a map day->meal->assignment; we will return a new plan
    // Create empty plan
    const days = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
    const meals = ['Breakfast','Lunch','Dinner','Snack'];
    const plan = {};
    days.forEach(d => { plan[d] = {}; meals.forEach(m => plan[d][m] = null); });

    // Start with existing plan if provided (we carry over any manual assignments)
    if(existingPlan){
      days.forEach(d => {
        meals.forEach(m => {
          if (existingPlan[d] && existingPlan[d][m]){
            plan[d][m] = clone(existingPlan[d][m]);
          }
        });
      });
    }

    // Create allocation buckets: for each dish, compute how many meal-slots it can fill
    const slots = [];
    dishes.forEach(d => {
      const canFill = Math.floor(d.totalServings / Math.max(1, d.servingSize));
      if (canFill > 0){
        slots.push({dish: d, remaining: canFill});
      }
    });

    // Sort slots so larger dishes go first (better distribution)
    slots.sort((a,b) => b.remaining - a.remaining);

    // Helper to find best day-meal for a dish to avoid repeats: choose day with lowest count of that dish
    function dishCountInPlan(dishId){
      let count = 0;
      days.forEach(d => { meals.forEach(m => { if(plan[d][m] && plan[d][m].id === dishId) count++; }); });
      return count;
    }

    // Fill slots greedily trying to spread across days
    slots.forEach(slot => {
      const id = slot.dish.id;
      while(slot.remaining > 0){
        // Find candidate cells
        const candidates = [];
        days.forEach((d, di) => {
          meals.forEach((m, mi) => {
            if (!plan[d][m]){
              candidates.push({day:d, meal:m, dayIndex:di, mealIndex:mi});
            }
          });
        });
        if (candidates.length === 0) break;

        // Prefer cells that do not already contain this dish on the same day to avoid multiple meals of the same dish in one day.
        const candidatesNoSameDay = candidates.filter(c => {
          const sameDayCount = Object.values(plan[c.day]).filter(x => x && x.id === id).length;
          return sameDayCount === 0;
        });
        const useCandidates = candidatesNoSameDay.length ? candidatesNoSameDay : candidates;

        // Track which meal indices this dish already occupies so we can prefer variety across meal types
        const assignedMealIndices = [];
        days.forEach((d) => { meals.forEach((m, mi) => { const a = plan[d][m]; if (a && a.id === id) assignedMealIndices.push(mi); }); });

        // Score candidates: heavy penalty for same-day repeats, small penalty if this meal type already used for this dish, and a tiny random tiebreaker
        useCandidates.forEach(c => {
          const sameDayCount = Object.values(plan[c.day]).filter(x => x && x.id === id).length;
          const mealVarietyPenalty = assignedMealIndices.includes(c.mealIndex) ? 5 : 0;
          // prefer mid-week slightly (existing heuristic) but penalize same-day strongly
          c.score = sameDayCount * 100 + Math.abs(3 - c.dayIndex) + mealVarietyPenalty + (Math.random() * 0.01);
        });

        useCandidates.sort((a,b) => a.score - b.score);
        const chosen = useCandidates[0];
        plan[chosen.day][chosen.meal] = { id: slot.dish.id, name: slot.dish.name, tag: slot.dish.tag };
        slot.remaining -= 1;
      }
    });

    return plan;
  }

  // Expose utilities
  window.AppStorage = window.AppStorage || {};
  window.AppStorage.save = save;
  window.AppStorage.load = load;
  window.AppStorage.clear = clear;
  window.AppStorage.uid = uid;
  window.AppUtils = window.AppUtils || {};
  window.AppUtils.clone = clone;
  window.AppUtils.distribute = distribute;

})(window, jQuery);
