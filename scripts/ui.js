/* scripts/ui.js
   Responsibility: render the UI, respond to user events, and manage application state.
   Defines window.App with App.init and App.render as required by the contract.
*/
(function(window, $){
  'use strict';

  window.App = window.App || {};

  // Default empty state
  const defaultState = {
    dishes: [], // {id,name,totalServings,servingSize,tag}
    plan: null // plan map day->meal->assignment
  };

  // Local state reference
  let state = window.AppUtils && window.AppUtils.clone ? window.AppUtils.clone(defaultState) : JSON.parse(JSON.stringify(defaultState));

  // DOM selectors
  const days = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
  const meals = ['Breakfast','Lunch','Dinner','Snack'];

  // Helper: persist current state
  function persist(){
    try{
      window.AppStorage.save(state);
    }catch(e){ console.error('Persist error', e); }
  }

  // Load state from storage or initialize
  function loadState(){
    const loaded = window.AppStorage.load();
    if (loaded && typeof loaded === 'object'){
      state = $.extend(true, {}, defaultState, loaded);
    } else {
      state = $.extend(true, {}, defaultState);
    }
  }

  // Render dish list
  function renderDishList(){
    const $list = $('#dish-list');
    $list.empty();
    if (!state.dishes || state.dishes.length === 0){
      $list.append('<div class="text-sm text-gray-500">No dishes yet. Add one to begin.</div>');
      return;
    }

    state.dishes.forEach(d => {
      const remaining = Math.max(0, d.totalServings - computeUsedServings(d.id));
      const $row = $(
        `<div class="flex items-center justify-between gap-2">
           <div class="flex items-center gap-3">
             <div class="w-8 h-8 rounded-md bg-emerald-100 text-emerald-700 flex items-center justify-center font-semibold">${escapeHtml(d.name.charAt(0) || 'D')}</div>
             <div>
               <div class="font-medium">${escapeHtml(d.name)}</div>
               <div class="text-xs text-gray-500">${d.totalServings} prepared · ${d.servingSize}/meal · ${escapeHtml(d.tag || '—')}</div>
             </div>
           </div>
           <div class="text-right text-xs">
             <div class="text-gray-700">${remaining} left</div>
             <div class="mt-1 flex gap-1">
               <button class="assign-btn px-2 py-1 text-xs rounded-md bg-white border" data-id="${d.id}">Assign</button>
               <button class="delete-btn px-2 py-1 text-xs rounded-md bg-red-50 text-red-600" data-id="${d.id}">Delete</button>
             </div>
           </div>
         </div>`
      );
      $list.append($row);
    });

    // Wire up per-item buttons
    $list.find('.assign-btn').on('click', function(){
      const id = $(this).data('id');
      openAssignModalForDish(id);
    });
    $list.find('.delete-btn').on('click', function(){
      const id = $(this).data('id');
      if (confirm('Delete this dish? This will remove it from the library but existing plan assignments will remain as text.')){
        state.dishes = state.dishes.filter(x => x.id !== id);
        persist();
        renderDishList();
        renderPlannerGrid();
      }
    });
  }

  // Escape helper for basic text nodes
  function escapeHtml(s){
    if(!s) return '';
    return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }

  // Compute used servings of a dish in current plan
  function computeUsedServings(dishId){
    if(!state.plan) return 0;
    let used = 0;
    days.forEach(d => { meals.forEach(m => { const a = state.plan[d] && state.plan[d][m]; if (a && a.id === dishId) used += 1; }); });
    // each assignment corresponds to one serving unit (servingSize accounted at dish level)
    return used * ( (state.dishes.find(x=>x.id===dishId) || {}).servingSize || 1 );
  }

  // Render planner grid
  function renderPlannerGrid(){
    const $tbody = $('#planner-grid');
    $tbody.empty();

    meals.forEach(meal => {
      const $tr = $('<tr></tr>');
      $tr.append(`<td class="font-medium py-2">${escapeHtml(meal)}</td>`);
      days.forEach(day => {
        const cell = state.plan && state.plan[day] && state.plan[day][meal] ? state.plan[day][meal] : null;
        const $td = $('<td class="planner-cell" tabindex="0"></td>');
        const inner = cell ?
          `<div class="dish-pill bg-emerald-50 text-emerald-700 inline-flex justify-between w-full">
             <span>${escapeHtml(cell.name)}</span>
             <span class="leftover">${computeLeftoverLabel(cell.id)}</span>
           </div>
           <div class="mt-1 text-xs text-gray-500">${escapeHtml(cell.tag || '')}</div>`
          : `<div class="cell-empty text-gray-400">(empty)</div>`;
        $td.html(inner);
        $td.attr('data-day', day).attr('data-meal', meal);
        // click to assign or clear
        $td.on('click keypress', function(e){
          // activate on Enter or click
          if (e.type === 'keypress' && e.which !== 13) return;
          openAssignModal($(this).data('day'), $(this).data('meal'));
        });
        $tr.append($td);
      });
      $tbody.append($tr);
    });
  }

  // Compute leftover label for dish assignment showing remaining servings after this meal
  function computeLeftoverLabel(dishId){
    const dish = state.dishes.find(x => x.id === dishId);
    if(!dish) return '';
    const usedServings = computeUsedServings(dishId);
    const remaining = Math.max(0, dish.totalServings - usedServings);
    return `${remaining} left`;
  }

  // Open assign modal for a particular cell
  let currentAssignTarget = null; // {day,meal}
  function openAssignModal(day, meal){
    currentAssignTarget = {day,meal};
    const $modal = $('#modal');
    const $select = $('#assign-dish');
    $select.empty();
    $select.append(`<option value="">-- none (clear) --</option>`);
    state.dishes.forEach(d => {
      const remaining = Math.max(0, d.totalServings - computeUsedServings(d.id));
      const disabled = remaining <= 0 ? 'disabled' : '';
      $select.append(`<option value="${d.id}" ${disabled}>${escapeHtml(d.name)} (${remaining} left)</option>`);
    });
    $('#modal').attr('aria-hidden','false').show();
    $('#assign-dish').focus();
  }

  function openAssignModalForDish(dishId){
    // find first empty cell and assign directly
    for(const d of days){
      for(const m of meals){
        if(!state.plan[d][m]){
          state.plan[d][m] = { id: dishId, name: (state.dishes.find(x=>x.id===dishId)||{}).name || 'Dish', tag: (state.dishes.find(x=>x.id===dishId)||{}).tag || '' };
          persist();
          renderPlannerGrid();
          renderDishList();
          return;
        }
      }
    }
    alert('No empty slots available. Clear a slot first or adjust servings.');
  }

  // Close modal
  function closeModal(){
    $('#modal').attr('aria-hidden','true').hide();
    currentAssignTarget = null;
  }

  // Assign from modal form
  function handleAssignSubmit(e){
    e.preventDefault();
    const dishId = $('#assign-dish').val();
    if(!currentAssignTarget){ closeModal(); return; }
    const {day,meal} = currentAssignTarget;
    if(!dishId){
      // clear assignment
      state.plan[day][meal] = null;
    } else {
      const dish = state.dishes.find(x => x.id === dishId);
      if(!dish){ alert('Dish not found'); closeModal(); return; }
      // Ensure dish has remaining servings
      const remaining = Math.max(0, dish.totalServings - computeUsedServings(dishId));
      if (remaining <= 0){ alert('No remaining servings for this dish'); closeModal(); return; }
      state.plan[day][meal] = { id: dish.id, name: dish.name, tag: dish.tag };
    }
    persist();
    renderPlannerGrid();
    renderDishList();
    closeModal();
  }

  // Add dish form handler
  function handleAddDish(e){
    e.preventDefault();
    const name = $('#dish-name').val().trim();
    const totalServings = parseInt($('#dish-servings').val(),10) || 0;
    const servingSize = parseInt($('#dish-per-meal').val(),10) || 1;
    const tag = $('#dish-tag').val();
    if(!name){ alert('Name required'); return; }
    if(totalServings < 1){ alert('Total servings must be at least 1'); return; }
    if(servingSize < 1){ alert('Servings per meal must be at least 1'); return; }
    const newDish = { id: window.AppStorage.uid('dish'), name, totalServings, servingSize, tag };
    state.dishes.push(newDish);
    persist();
    // clear form
    $('#dish-form')[0].reset();
    $('#dish-servings').val('4');
    $('#dish-per-meal').val('1');
    renderDishList();
  }

  // Auto-plan week: uses distribution algorithm
  function autoPlan(){
    const dist = window.AppUtils.distribute(state.dishes, state.plan || null);
    state.plan = dist;
    persist();
    renderPlannerGrid();
    renderDishList();
  }

  // Export as JSON: copies to clipboard
  function exportWeek(){
    const payload = { state };
    const raw = JSON.stringify(payload, null, 2);
    copyToClipboard(raw);
    alert('Week JSON copied to clipboard');
  }

  function copyToClipboard(text){
    // Create temp textarea
    const $ta = $('<textarea/>').css({position:'absolute',left:'-9999px',top:'-9999px'}).text(text);
    $('body').append($ta);
    $ta.select();
    try{ document.execCommand('copy'); }catch(e){ console.warn('Copy failed', e); }
    $ta.remove();
  }

  // Reset app
  function resetApp(){
    if (!confirm('Reset planner and remove all dishes?')) return;
    window.AppStorage.clear();
    state = $.extend(true, {}, defaultState);
    initPlannerEmptyPlan();
    renderPlannerGrid();
    renderDishList();
  }

  // Clear week assignments but keep dishes
  function clearWeek(){
    initPlannerEmptyPlan();
    persist();
    renderPlannerGrid();
  }

  function initPlannerEmptyPlan(){
    const plan = {};
    days.forEach(d => { plan[d] = {}; meals.forEach(m => plan[d][m] = null); });
    state.plan = plan;
  }

  // Event wiring
  function bindEvents(){
    $('#dish-form').on('submit', handleAddDish);
    $('#auto-plan').on('click', function(e){ e.preventDefault(); autoPlan(); });
    $('#modal-cancel').on('click', function(){ closeModal(); });
    $('#assign-form').on('submit', handleAssignSubmit);
    $('#export-json').on('click', exportWeek);
    $('#export-week').on('click', exportWeek);
    $('#reset-app').on('click', resetApp);
    $('#clear-week').on('click', function(){ if(confirm('Clear all assignments for the week?')) clearWeek(); });
    // clicking outside modal closes it
    $('#modal').on('click', function(e){ if(e.target === this) closeModal(); });
  }

  // Public API required by main.js contract
  window.App.init = function(){
    try{
      loadState();
      if(!state.plan) initPlannerEmptyPlan();
      bindEvents();
    }catch(e){ console.error('App.init error', e); }
  };

  window.App.render = function(){
    try{
      renderDishList();
      renderPlannerGrid();
    }catch(e){ console.error('App.render error', e); }
  };

})(window, jQuery);
