require('dotenv').config();
const mineflayer = require('mineflayer');
const { pathfinder, Movements, goals } = require('mineflayer-pathfinder');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const Vec3 = require('vec3');

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: 'gemini-pro' });

const bot = mineflayer.createBot({
  host: process.env.BOT_HOST,
  port: parseInt(process.env.BOT_PORT),
  username: process.env.BOT_USERNAME,
  version: process.env.BOT_VERSION,
});

const mcData = require('minecraft-data')(bot.version);

bot.loadPlugin(pathfinder);

const commandTemplates = [
  { command: 'come', patterns: ['follow me', 'come here', 'come to me', 'follow'] },
  { command: 'goto', patterns: ['go to', 'move to', 'walk to', 'find', 'locate'] },
  { command: 'stop', patterns: ['halt', 'cease', 'cancel', 'abort', 'terminate', 'stay'] },
  { command: 'dig', patterns: ['mine', 'break', 'destroy', 'dig up', 'excavate', 'collect'] },
  { command: 'attack', patterns: ['fight', 'hit', 'kill', 'combat', 'engage', 'defend'] },
  { command: 'drop', patterns: ['drop', 'throw', 'toss', 'get rid of', 'dispose'] },
  { command: 'equip', patterns: ['wear', 'hold', 'put on', 'equip', 'use', 'wield'] },
  { command: 'store', patterns: ['put in', 'store', 'place in', 'move to', 'transfer'] },
  { command: 'inventory', patterns: ['show items', 'what do you have', 'check inventory'] },
  { command: 'craft', patterns: ['make', 'create', 'craft', 'build', 'construct'] },
  { command: 'smelt', patterns: ['cook', 'furnace', 'smelt', 'process'] },
  { command: 'eat', patterns: ['eat', 'consume', 'drink', 'feed', 'restore health'] },
  { command: 'heal', patterns: ['heal', 'recover', 'restore', 'get healthy'] },
  { command: 'sleep', patterns: ['sleep', 'rest', 'use bed', 'night skip'] },
  { command: 'guard', patterns: ['protect', 'guard', 'watch', 'defend area'] },
  { command: 'flee', patterns: ['run', 'escape', 'retreat', 'get away'] }
];

const OWNER_USERNAME = process.env.OWNER_USERNAME;

let reconnecting = false;
let reconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 5;
const RECONNECT_INTERVAL = 5000;

bot.on('spawn', () => {
  console.log('\x1b[32m%s\x1b[0m', '✔ Bot successfully spawned in game');
});

bot.on('login', () => {
  console.log('\x1b[32m%s\x1b[0m', '✔ Bot successfully logged in');
  console.log('\x1b[36m%s\x1b[0m', `➜ Owner username set to: ${OWNER_USERNAME}`);
  bot.chat('Hello! I am Altes, ready to assist you.');
});

bot.on('disconnect', (reason) => {
  console.log('\x1b[31m%s\x1b[0m', `✘ Bot disconnected: ${reason}`);
});

bot.on('end', (reason) => {
  console.log('\x1b[31m%s\x1b[0m', `✘ Bot session ended: ${reason || 'Unknown reason'}`);
  handleDisconnect();
});

bot.on('kicked', (reason) => {
  console.log('\x1b[31m%s\x1b[0m', `✘ Bot was kicked: ${reason}`);
});

bot.on('error', (err) => {
  console.error('\x1b[31m%s\x1b[0m', '✘ Bot encountered an error:', err);
  if (err.code === 'ETIMEDOUT' || err.code === 'ECONNREFUSED') {
    console.log('\x1b[33m%s\x1b[0m', '⚠ Connection failed, attempting to reconnect...');
    handleDisconnect();
  }
});

// Chat event handler using Gemini
bot.on('chat', async (username, message) => {
  console.log('Received chat message from:', username, 'Message:', message);
  
  // Only respond to the owner
  if (username !== OWNER_USERNAME) {
    console.log(`Ignoring message from non-owner: ${username}`);
    return;
  }

  console.log(`Processing message from owner ${username}: ${message}`);
  
  try {
    console.log('Creating Gemini prompt...');
    const prompt = `
    You are a Minecraft game assistant bot named Altes. You help players with in-game actions.
    Your task is to classify messages as either game commands or friendly chat.

    Current game context:
    - Game: Minecraft
    - Bot name: Altes
    - Player: ${username}
    - Game status: ${JSON.stringify({
      health: bot.health,
      food: bot.food,
      inventory: bot.inventory.items().map(item => item.name)
    })}

    Message to analyze: "${message}"

    If the message requests any game action, respond with:
    {
      "type": "command",
      "command": "one of: come/goto/dig/attack/stop/drop/craft/equip/store/eat",
      "parameters": {
        "targets": ["game objects"],
        "items": ["inventory items"],
        "quantity": "number or all"
      }
    }

    If the message is friendly chat, respond with:
    {
      "type": "conversation",
      "message": "friendly game-appropriate response"
    }

    Example game commands:
    "collect wood" -> {"type": "command", "command": "dig", "parameters": {"targets": ["oak_log"]}}
    "come here" -> {"type": "command", "command": "come"}
    "store items" -> {"type": "command", "command": "store"}

    Example chat:
    "hello" -> {"type": "conversation", "message": "Hi! How can I help with your Minecraft adventure?"}
    "thanks" -> {"type": "conversation", "message": "You're welcome! Let me know if you need anything else."}`;

    const result = await model.generateContent(prompt);
    const response = result.response.text();
    console.log('Raw response:', response);
    
    let analysis;
    try {
      // Clean up response and parse JSON
      const cleanResponse = response.replace(/```json\n?/, '').replace(/```\n?/, '').trim();
      analysis = JSON.parse(cleanResponse);
    } catch (parseError) {
      console.error('Failed to parse AI response:', parseError);
      bot.chat('I had trouble understanding that. Could you rephrase it?');
      return;
    }

    if (analysis.type === 'conversation') {
      bot.chat(analysis.message || "I understand, but I'm not sure how to respond.");
    } else if (analysis.type === 'command') {
      const commandName = analysis.command;
      const parameters = analysis.parameters || {};
      await executeCommand(commandName, parameters, username);
    } else {
      bot.chat("I'm not sure what you want me to do. Could you be more specific?");
    }

  } catch (err) {
    console.error('Error processing message:', err);
    bot.chat('Sorry, I encountered an error while processing your request.');
  }
});

// Add this new function to identify target types
async function identifyTarget(targetName) {
  console.log('Identifying target:', targetName);
  
  // Define entity categories
  const entityCategories = {
    'monster': ['zombie', 'skeleton', 'creeper', 'spider', 'enderman', 'witch', 'slime'],
    'animal': ['cow', 'sheep', 'pig', 'chicken', 'wolf', 'horse'],
    'player': Object.keys(bot.players)
  };

  // If the target is a category (like "monster"), find the nearest matching entity
  if (entityCategories[targetName.toLowerCase()]) {
    const validTypes = entityCategories[targetName.toLowerCase()];
    let nearestEntity = null;
    let nearestDistance = Infinity;

    // Look through all entities
    for (const entity of Object.values(bot.entities)) {
      if (!entity || !entity.name) continue;

      // Check if this entity type is in our valid types
      if (validTypes.some(type => entity.name.toLowerCase().includes(type))) {
        const distance = bot.entity.position.distanceTo(entity.position);
        if (distance < nearestDistance) {
          nearestDistance = distance;
          nearestEntity = entity;
        }
      }
    }

    if (nearestEntity) {
      return { 
        type: 'entity', 
        target: nearestEntity,
        name: nearestEntity.name,
        distance: nearestDistance 
      };
    }
  }

  // Check if it's a specific entity name
  const entity = Object.values(bot.entities).find(e => 
    e.name?.toLowerCase().includes(targetName.toLowerCase())
  );
  if (entity) {
    return { 
      type: 'entity', 
      target: entity,
      name: entity.name,
      distance: bot.entity.position.distanceTo(entity.position)
    };
  }

  // Check if it's a player
  const player = Object.values(bot.players).find(p => 
    p.username.toLowerCase().includes(targetName.toLowerCase())
  );
  if (player) {
    return { type: 'player', target: player };
  }

  // Check if it's a block
  const block = bot.findBlock({
    matching: (b) => b.name.toLowerCase().includes(targetName.toLowerCase()),
    maxDistance: 32,
  });
  if (block) {
    return { type: 'block', target: block };
  }

  // Check common names for blocks
  const commonNames = {
    'wood': ['oak_log', 'birch_log', 'spruce_log', 'jungle_log', 'acacia_log', 'dark_oak_log'],
    'tree': ['oak_log', 'birch_log', 'spruce_log', 'jungle_log', 'acacia_log', 'dark_oak_log'],
    'stone': ['stone', 'cobblestone'],
    'iron': ['iron_ore'],
    'diamond': ['diamond_ore']
  };

  const commonTarget = commonNames[targetName.toLowerCase()];
  if (commonTarget) {
    for (const specificName of commonTarget) {
      const result = await identifyTarget(specificName);
      if (result.target) return result;
    }
  }

  return { type: 'unknown', target: null };
}

// Add advanced state tracking
const botState = {
  isGuarding: false,
  guardTarget: null,
  isFighting: false,
  currentTask: null,
  lastPosition: null,
  inventory: {
    tools: [],
    weapons: [],
    armor: [],
    materials: [],
    food: []
  },
  threats: new Set(),
  safePosition: null
};

// Add advanced entity categories
const entityCategories = {
  hostile: ['zombie', 'skeleton', 'creeper', 'spider', 'enderman', 'witch', 'slime', 'phantom'],
  passive: ['cow', 'sheep', 'pig', 'chicken', 'wolf', 'horse', 'rabbit', 'villager'],
  valuable: ['item_diamond', 'item_gold_ingot', 'item_iron_ingot', 'item_emerald'],
  dangerous: ['lava', 'fire', 'cactus', 'sweet_berry_bush']
};

// Add tool requirements
const toolRequirements = {
  'diamond_ore': ['diamond_pickaxe', 'iron_pickaxe'],
  'iron_ore': ['iron_pickaxe', 'stone_pickaxe'],
  'oak_log': ['iron_axe', 'stone_axe', 'wooden_axe'],
  'stone': ['iron_pickaxe', 'stone_pickaxe', 'wooden_pickaxe']
};

// Add advanced combat system
async function engageInCombat(target) {
  botState.isFighting = true;
  
  try {
    // Equip best weapon
    const weapon = bot.inventory.items().find(item => 
      item.name.includes('sword') || item.name.includes('axe')
    );
    if (weapon) await bot.equip(weapon, 'hand');

    // Equip armor if available
    await equipBestArmor();

    while (target.isValid && target.health > 0 && botState.isFighting) {
      const distance = bot.entity.position.distanceTo(target.position);
      
      if (distance > 3) {
        await bot.pathfinder.goto(new goals.GoalFollow(target, 2));
      } else {
        await bot.lookAt(target.position.offset(0, target.height * 0.5, 0));
        if (bot.entity.onGround) await bot.attack(target);
      }

      // Check own health and retreat if needed
      if (bot.health < 8) {
        botState.isFighting = false;
        await fleeFromDanger(target);
        return;
      }
    }
  } catch (err) {
    console.error('Combat error:', err);
  } finally {
    botState.isFighting = false;
  }
}

// Add advanced pathfinding
async function navigateToPosition(position, options = {}) {
  const { allowParkour = true, sprint = true, timeout = 60000 } = options;
  
  try {
    const movements = new Movements(bot, mcData);
    movements.allowParkour = allowParkour;
    movements.canDig = false;
    
    bot.pathfinder.setMovements(movements);
    
    if (sprint && bot.entity.food > 6) {
      bot.setSprinting(true);
    }

    const goal = new goals.GoalBlock(position.x, position.y, position.z);
    await bot.pathfinder.goto(goal);
    
    return true;
  } catch (err) {
    console.error('Navigation error:', err);
    return false;
  }
}

// Add inventory management
async function organizeInventory() {
  const items = bot.inventory.items();
  
  // Categorize items
  botState.inventory = {
    tools: items.filter(item => item.name.includes('pickaxe') || item.name.includes('axe') || item.name.includes('shovel')),
    weapons: items.filter(item => item.name.includes('sword')),
    armor: items.filter(item => item.name.includes('helmet') || item.name.includes('chestplate') || item.name.includes('leggings') || item.name.includes('boots')),
    materials: items.filter(item => !item.name.includes('pickaxe') && !item.name.includes('sword') && !item.name.includes('helmet')),
    food: items.filter(item => item.name.includes('apple') || item.name.includes('bread') || item.name.includes('cooked'))
  };
}

// Add advanced equipment handling
async function equipBestArmor() {
  const armorSlots = {
    helmet: 'head',
    chestplate: 'torso',
    leggings: 'legs',
    boots: 'feet'
  };

  for (const [armorType, slot] of Object.entries(armorSlots)) {
    const bestArmor = bot.inventory.items()
      .filter(item => item.name.includes(armorType))
      .sort((a, b) => b.name.localeCompare(a.name))[0];
    
    if (bestArmor) {
      try {
        await bot.equip(bestArmor, slot);
      } catch (err) {
        console.error(`Failed to equip ${armorType}:`, err);
      }
    }
  }
}

// Add event listeners for advanced features
bot.on('entityUpdate', (entity) => {
  if (entityCategories.hostile.some(type => entity.name?.includes(type))) {
    botState.threats.add(entity);
  }
});

bot.on('move', () => {
  botState.lastPosition = bot.entity.position.clone();
});

bot.on('health', () => {
  if (bot.health < 8 && botState.isFighting) {
    botState.isFighting = false;
    fleeFromDanger();
  }
});

// First, define the base executeCommand function
async function executeCommand(command, parameters, username) {
  console.log(`Executing command: ${command} with parameters:`, parameters);

  switch (command) {
    case 'come':
      const playerToFollow = parameters.targets?.[0] || username;
      const playerTarget = await identifyTarget(playerToFollow);
      if (playerTarget.type === 'player') {
        followPlayer(playerTarget.target.username);
      } else {
        bot.chat(`I can't find player ${playerToFollow}.`);
      }
      break;

    case 'goto':
      const targetToFind = parameters.targets?.[0] || parameters.locations?.[0];
      if (!targetToFind) {
        bot.chat('I need to know where to go. Can you specify a location or target?');
        return;
      }
      await goToTarget(targetToFind);
      break;

    case 'dig':
      const blockToDig = parameters.targets?.[0];
      if (!blockToDig) {
        bot.chat('What should I dig? Please specify a block type.');
        return;
      }
      await digBlock(blockToDig);
      break;

    case 'attack':
      const entityToAttack = parameters.targets?.[0];
      if (!entityToAttack) {
        bot.chat('What should I attack? Please specify a target.');
        return;
      }
      await attackEntity(entityToAttack);
      break;

    case 'drop':
      const itemToDrop = parameters.items?.[0];
      const quantity = parameters.quantity || 'all';
      await dropItems(itemToDrop, quantity);
      break;

    case 'stop':
      stopAllTasks();
      bot.chat('Stopping all current actions.');
      break;

    default:
      bot.chat('I understand that command but I need more specific instructions.');
  }
}

// Then, enhance it with the advanced features
const oldExecuteCommand = executeCommand;
executeCommand = async function(command, parameters, username) {
  await organizeInventory();
  
  switch (command) {
    case 'attack':
      const target = await identifyTarget(parameters.targets?.[0]);
      if (target.type === 'entity') {
        await engageInCombat(target.target);
      }
      break;

    case 'flee':
      const fleeFrom = parameters.targets?.[0];
      await fleeFromDanger(fleeFrom);
      break;

    default:
      await oldExecuteCommand(command, parameters, username);
  }
};

// Helper functions for command execution
async function followPlayer(playerName) {
  // Log for debugging
  console.log('Looking for player:', playerName);
  console.log('Available players:', Object.keys(bot.players));

  // First try to get the player object
  const player = bot.players[playerName];
  
  if (!player) {
    bot.chat(`I can't find player ${playerName} in the game.`);
    return;
  }

  // If we have the player but no entity (they're too far), move to their last known position
  if (!player.entity) {
    bot.chat(`I can't see ${playerName}, but I'll try to move closer.`);
    // Try to move towards their last known position if available
    if (player.position) {
      bot.pathfinder.setGoal(new goals.GoalBlock(
        player.position.x,
        player.position.y,
        player.position.z
      ));
    } else {
      bot.chat(`I don't know where ${playerName} is. Please come closer or give me coordinates.`);
    }
    return;
  }

  // If we can see them, follow them as they say (:
  bot.chat(`Following ${playerName}.`);
  bot.pathfinder.setGoal(new goals.GoalFollow(player.entity, 2));
}

async function goToTarget(targetName) {
  const block = bot.findBlock({
    matching: (b) => b.name.includes(targetName.toLowerCase()),
    maxDistance: 32,
  });

  if (block) {
    bot.chat(`Found ${targetName} at ${block.position}. Heading there.`);
    bot.pathfinder.setGoal(new goals.GoalBlock(block.position.x, block.position.y, block.position.z));
    return;
  }

  const entity = Object.values(bot.entities).find(
    (e) => e.name?.toLowerCase().includes(targetName.toLowerCase())
  );

  if (entity) {
    bot.chat(`Found ${targetName} at ${entity.position}. Heading there.`);
    bot.pathfinder.setGoal(new goals.GoalFollow(entity, 2));
    return;
  }

  bot.chat(`I couldn't find anything matching "${targetName}".`);
}

async function digBlock(blockName) {
  const block = bot.findBlock({
    matching: (b) => b.name.includes(blockName.toLowerCase()),
    maxDistance: 32,
  });

  if (!block) {
    bot.chat(`I couldn't find any ${blockName} nearby.`);
    return;
  }

  try {
    bot.chat(`Starting to dig ${blockName}.`);
    await bot.dig(block);
    bot.chat('Done digging!');
  } catch (err) {
    bot.chat(`Failed to dig: ${err.message}`);
  }
}

async function attackEntity(entityName) {
  const entity = Object.values(bot.entities).find(
    (e) => e.name?.toLowerCase().includes(entityName.toLowerCase())
  );

  if (!entity) {
    bot.chat(`I couldn't find any ${entityName} nearby.`);
    return;
  }

  try {
    bot.chat(`Attacking ${entityName}!`);
    await bot.attack(entity);
  } catch (err) {
    bot.chat(`Failed to attack: ${err.message}`);
  }
}

function stopAllTasks() {
  bot.pathfinder.setGoal(null);
}

async function dropItems(itemName, quantity = 1) {
  try {
    if (quantity === 'all' || !itemName) {
      const items = bot.inventory.items();
      if (items.length === 0) {
        bot.chat("I don't have any items to drop.");
        return;
      }
      
      bot.chat("Dropping all my items...");
      for (const item of items) {
        try {
          await bot.toss(item.type, null, item.count);
        } catch (err) {
          console.error(`Failed to drop item ${item.name}:`, err);
        }
      }
      bot.chat("Dropped all items.");
      return;
    }

    // Original single item drop
    const item = bot.inventory.findInventoryItem(itemName);
    if (!item) {
      bot.chat(`I don't have any ${itemName} to drop.`);
      return;
    }
    const amount = Math.min(quantity, item.count);
    await bot.toss(item.type, null, amount);
    bot.chat(`Dropped ${amount} ${itemName}.`);
  } catch (err) {
    console.error('Error in dropItems:', err);
    bot.chat(`Failed to drop items: ${err.message}`);
  }
}

async function craftItem(itemName, quantity = 1) {
  try {
    // Implementation depends on crafting system
    bot.chat(`Attempting to craft ${quantity} ${itemName}...`);
  } catch (err) {
    bot.chat(`Failed to craft: ${err.message}`);
  }
}

async function equipItem(itemName) {
  try {
    const item = bot.inventory.findInventoryItem(itemName);
    if (!item) {
      bot.chat(`I don't have ${itemName} to equip.`);
      return;
    }
    await bot.equip(item, 'hand');
    bot.chat(`Equipped ${itemName}.`);
  } catch (err) {
    bot.chat(`Failed to equip item: ${err.message}`);
  }
}

async function storeItem(itemName, containerType) {
  try {
    // Implementation depends on storage system
    bot.chat(`Attempting to store ${itemName} in ${containerType}...`);
  } catch (err) {
    bot.chat(`Failed to store item: ${err.message}`);
  }
}

async function eatFood(foodName) {
  try {
    const food = bot.inventory.findInventoryItem(foodName);
    if (!food) {
      bot.chat(`I don't have any ${foodName} to eat.`);
      return;
    }
    await bot.equip(food, 'hand');
    await bot.consume();
    bot.chat(`Ate ${foodName}.`);
  } catch (err) {
    bot.chat(`Failed to eat: ${err.message}`);
  }
}

bot.on('error', (err) => {
  console.error('Bot encountered an error:', err);
});

bot.on('end', () => {
  console.log('Bot disconnected. Attempting to reconnect...');
  if (!reconnecting) {
    reconnecting = true;
    setTimeout(async () => {
      try {
        await bot.connect();
        reconnecting = false;
      } catch (err) {
        console.error('Failed to reconnect:', err);
        reconnecting = false;
      }
    }, 5000);
  }
});

// Add these helper functions
function checkBotState(botState) {
  if (!botState) return true;

  if (botState.health_status === 'critical') {
    bot.chat("I'm too injured to do that right now!");
    return false;
  }

  if (botState.hunger_status === 'starving') {
    bot.chat("I need to eat something first!");
    return false;
  }

  if (botState.equipment_status === 'needs_equipment') {
    bot.chat("I need proper equipment for this task.");
    return false;
  }

  return true;
}

async function executePreparationStep(step) {
  // Implement preparation logic
  console.log('Executing preparation step:', step);
}

async function executeFollowUpStep(step) {
  // Implement follow-up logic
  console.log('Executing follow-up step:', step);
}

async function executeFallbackAction(fallback) {
  // Implement fallback logic
  console.log('Executing fallback action:', fallback);
  bot.chat(`Primary action failed. ${fallback}`);
}

// Add new helper functions for the new commands
async function showInventory() {
  const items = bot.inventory.items();
  if (items.length === 0) {
    bot.chat("I don't have any items in my inventory.");
    return;
  }
  
  const itemCounts = items.reduce((acc, item) => {
    acc[item.name] = (acc[item.name] || 0) + item.count;
    return acc;
  }, {});
  
  bot.chat('My inventory contains:');
  Object.entries(itemCounts).forEach(([item, count]) => {
    bot.chat(`${item}: ${count}`);
  });
}

async function smeltItem(item, fuel) {
  try {
    const furnace = bot.findBlock({
      matching: block => block.name === 'furnace',
      maxDistance: 32
    });
    
    if (!furnace) {
      bot.chat('I need a furnace to smelt items.');
      return;
    }

    bot.chat(`Attempting to smelt ${item} using ${fuel}...`);
    // Implement smelting logic here
    } catch (err) {
    bot.chat(`Failed to smelt: ${err.message}`);
  }
}

async function healSelf() {
  try {
    if (bot.health >= 20) {
      bot.chat("I'm already at full health!");
      return;
    }

    const food = bot.inventory.items().find(item => 
      item.name.includes('apple') || 
      item.name.includes('bread') || 
      item.name.includes('cooked')
    );

    if (food) {
      await eatFood(food.name);
    } else {
      bot.chat("I don't have any food to heal with.");
    }
  } catch (err) {
    bot.chat(`Failed to heal: ${err.message}`);
  }
}

async function sleepInBed() {
  try {
    const bed = bot.findBlock({
      matching: block => block.name.includes('bed'),
      maxDistance: 32
    });

    if (!bed) {
      bot.chat("I can't find a bed nearby.");
      return;
    }

    await bot.sleep(bed);
    bot.chat("Good night!");
  } catch (err) {
    bot.chat(`Cannot sleep: ${err.message}`);
  }
}

async function guardTarget(target) {
  try {
    const targetEntity = await identifyTarget(target);
    if (!targetEntity.target) {
      bot.chat(`I can't find ${target} to guard.`);
      return;
    }

    bot.chat(`Guarding ${target}. I'll protect against any threats.`);
    // Implement guard behavior
  } catch (err) {
    bot.chat(`Failed to guard: ${err.message}`);
  }
}

async function fleeFromDanger(danger) {
  try {
    const dangerEntity = danger ? await identifyTarget(danger) : null;
    if (dangerEntity?.target) {
      // Run away from specific danger
      const pos = dangerEntity.target.position;
      const awayPos = bot.entity.position.offset(-pos.x, 0, -pos.z);
      bot.pathfinder.setGoal(new goals.GoalBlock(awayPos.x, awayPos.y, awayPos.z));
    } else {
      // General retreat
      bot.chat("Retreating to a safe distance!");
      // Implement general retreat behavior
    }
  } catch (err) {
    bot.chat(`Failed to flee: ${err.message}`);
  }
}

// Fix 4: Add error handling for pathfinding
bot.on('goal_reached', (goal) => {
  console.log('Reached goal:', goal);
});

bot.on('path_update', (results) => {
  console.log('Path update:', results);
});

bot.on('path_reset', (reason) => {
  console.log('Path reset:', reason);
});

