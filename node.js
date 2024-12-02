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
  { command: 'guard', patterns: ['protect', 'guard', 'watch', 'defend', 'defend me', 'protect me'] },
  { command: 'flee', patterns: ['run', 'escape', 'retreat', 'get away'] },
  { command: 'say', patterns: ['say', 'tell', 'announce', 'message', 'chat'] }
];

const OWNER_USERNAME = process.env.OWNER_USERNAME;

let reconnecting = false;
let reconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 5;
const RECONNECT_INTERVAL = 5000;

bot.on('login', () => {
  console.log('\x1b[32m%s\x1b[0m', '✔ Bot successfully logged in');
  console.log('\x1b[36m%s\x1b[0m', `➜ Owner username set to: ${OWNER_USERNAME}`);
  bot.chat('Hello! I am Altes, ready to assist you.');
});

bot.on('disconnect', (reason) => {
  console.log('\x1b[31m%s\x1b[0m', `✘ Bot disconnected: ${reason}`);
});

bot.on('end', async (reason) => {
  console.log('\x1b[31m%s\x1b[0m', `✘ Bot session ended: ${reason || 'Unknown reason'}`);
  await handleDisconnect();
});

bot.on('kicked', (reason) => {
  console.log('\x1b[31m%s\x1b[0m', `✘ Bot was kicked: ${reason}`);
});

bot.on('error', (err) => {
  console.error('\x1b[31m%s\x1b[0m', '✘ Bot encountered an error:', err);
  if (err.code === 'ECONNRESET' || err.code === 'ETIMEDOUT' || err.code === 'ECONNREFUSED') {
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
    You are a Minecraft game assistant bot named Altes. You are a social bot that loves talking and helping players with in-game actions.
    Your task is to analyze messages and respond appropriately, either with commands or friendly chat.

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

    If the message contains a command or action request, respond with:
    {
      "type": "command",
      "command": "one of: come/goto/dig/attack/stop/drop/craft/equip/store/eat/say/guard",
      "parameters": {
        "targets": ["game objects"],
        "items": ["inventory items"],
        "quantity": "number or all",
        "message": "message to say in chat"
      }
    }

    If the message is friendly chat or a question, respond with:
    {
      "type": "conversation",
      "message": "friendly game-appropriate response"
    }

    Example commands:
    "follow me" -> {"type": "command", "command": "come"}
    "mine some wood" -> {"type": "command", "command": "dig", "parameters": {"targets": ["oak_log"]}}
    "protect me" -> {"type": "command", "command": "guard", "parameters": {"targets": ["${username}"]}}
    "say hello" -> {"type": "command", "command": "say", "parameters": {"message": "hello"}}

    Example conversations:
    "hello" -> {"type": "conversation", "message": "Hi there! How can I help you today?"}
    "how are you" -> {"type": "conversation", "message": "I'm doing great! Ready to help with anything you need."}
    "what can you do" -> {"type": "conversation", "message": "I can help with many tasks like mining, building, fighting mobs, and more. Just let me know what you need!"}
    "thanks" -> {"type": "conversation", "message": "You're welcome! Always happy to help."}

    Remember:
    1. If the message contains both chat and a command, prioritize the command
    2. Be friendly and helpful in conversation responses
    3. Keep chat responses contextual to Minecraft
    4. Extract specific targets and items from commands when possible`;

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
  isFollowing: false,
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
  dangerous: ['lava', 'fire', 'cactus', 'sweet_berry_bush'],
  boss: ['ender_dragon', 'wither', 'elder_guardian'],
  food: [
    // Basic foods
    'apple', 'bread', 'carrot', 'potato', 'beetroot', 'melon_slice', 'sweet_berries',
    // Cooked meats
    'cooked_beef', 'cooked_porkchop', 'cooked_mutton', 'cooked_chicken', 'cooked_rabbit', 'cooked_cod', 'cooked_salmon',
    // Raw foods
    'beef', 'porkchop', 'mutton', 'chicken', 'rabbit', 'cod', 'salmon',
    // Special foods
    'golden_apple', 'enchanted_golden_apple', 'golden_carrot', 'mushroom_stew', 'rabbit_stew', 'suspicious_stew',
    'dried_kelp', 'cookie', 'pumpkin_pie', 'honey_bottle', 'chorus_fruit'
  ]
};

// Add tool requirements
const toolRequirements = {
  'diamond_ore': ['diamond_pickaxe', 'iron_pickaxe'],
  'iron_ore': ['iron_pickaxe', 'stone_pickaxe'],
  'oak_log': ['iron_axe', 'stone_axe', 'wooden_axe'],
  'stone': ['iron_pickaxe', 'stone_pickaxe', 'wooden_pickaxe']
};

// Enhanced PvE combat function
async function engageHostileMob(target) {
  try {
    if (!entityCategories.hostile.some(type => target.name?.includes(type))) {
      bot.chat("This isn't a hostile mob.");
      return;
    }

    bot.chat(`Engaging hostile mob: ${target.name}`);
    
    // Prepare for combat
    await prepareForCombat();
    
    while (target.isValid && target.health > 0 && botState.isFighting) {
      const distance = bot.entity.position.distanceTo(target.position);
      
      // Strategic combat
      if (target.name.includes('creeper')) {
        // Keep distance from creepers
        if (distance < 4) {
          await moveAwayFrom(target.position);
          continue;
        }
      } else if (target.name.includes('skeleton')) {
        // Zigzag approach to skeletons
        await zigzagApproach(target);
      }

      // Normal combat routine
      await combatRoutine(target);
      
      // Health management
      await healthManagement();
    }

  } catch (err) {
    console.error('PvE Combat error:', err);
    bot.chat("Combat error: " + err.message);
  }
}

// Combat preparation
async function prepareForCombat() {
  // Equip best armor
  await equipBestArmor();
  
  // Equip best weapon
  const weapons = bot.inventory.items().filter(item => 
    item.name.includes('sword') || item.name.includes('axe')
  ).sort((a, b) => {
    const materials = ['netherite', 'diamond', 'iron', 'stone', 'wooden'];
    return materials.indexOf(a.name.split('_')[0]) - materials.indexOf(b.name.split('_')[0]);
  });
  
  if (weapons[0]) {
    await bot.equip(weapons[0], 'hand');
  }
  
  // Check food
  if (bot.food < 18) {
    await eatFood();
  }
}

// Combat routine
async function combatRoutine(target) {
  const distance = bot.entity.position.distanceTo(target.position);
  
  if (distance > 3) {
    await bot.pathfinder.goto(new goals.GoalFollow(target, 2));
  } else {
    await bot.lookAt(target.position.offset(0, target.height * 0.5, 0));
    if (bot.entity.onGround) {
      bot.setControlState('jump', true);
      await bot.attack(target);
      bot.setControlState('jump', false);
    }
  }
}

// Health management
async function healthManagement() {
  if (bot.health < 20 || bot.food < 20) {
    await eatFood(true); // Force eat when health is not full
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
      botState.isFollowing = false;
      botState.isFighting = false;
      botState.isGuarding = false;
      break;

    case 'say':
      const messageToSay = parameters.message;
      if (!messageToSay) {
        bot.chat("What would you like me to say?");
        return;
      }
      bot.chat(messageToSay);
      break;

    case 'guard':
      const guardTarget = parameters.targets?.[0] || username; // Default to owner if no target specified
      if (guardTarget.toLowerCase() === username.toLowerCase()) {
        bot.chat(`I'll protect you, ${username}!`);
        await guardPlayer(username);
      } else {
        await guardTarget(guardTarget);
      }
      break;

    case 'eat':
      const foodItem = parameters.items?.[0];
      if (foodItem) {
        // Try to eat specific food
        const item = bot.inventory.items().find(i => i.name.includes(foodItem));
        if (item) {
          await bot.equip(item, 'hand');
          await bot.consume();
        } else {
          bot.chat(`I don't have any ${foodItem}`);
        }
      } else {
        // Eat any available food
        const ate = await eatFood(true);
        if (!ate) {
          bot.chat("I don't have any food to eat!");
        }
      }
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
  try {
    const player = bot.players[playerName];
    
    if (!player) {
      bot.chat(`I can't find ${playerName} in the game.`);
      return;
    }

    bot.chat(`Following ${playerName}.`);
    botState.isFollowing = true;

    // Set up continuous following
    while (botState.isFollowing) {
      if (!player.entity) {
        bot.chat(`I lost sight of ${playerName}. Waiting...`);
        await new Promise(resolve => setTimeout(resolve, 1000));
        continue;
      }

      const distance = bot.entity.position.distanceTo(player.entity.position);
      
      // If too far, move closer
      if (distance > 3) {
        const movements = new Movements(bot, mcData);
        movements.allowParkour = true;
        movements.canDig = false;
        bot.pathfinder.setMovements(movements);

        if (distance > 10 && bot.food > 6) {
          bot.setControlState('sprint', true);
        } else {
          bot.setControlState('sprint', false);
        }

        await bot.pathfinder.goto(new goals.GoalFollow(player.entity, 2));
      } else {
        bot.setControlState('sprint', false);
        await bot.lookAt(player.entity.position.offset(0, player.entity.height, 0));
      }

      await new Promise(resolve => setTimeout(resolve, 250));
    }
  } catch (err) {
    console.error('Following error:', err);
    bot.chat(`Lost track of ${playerName}: ${err.message}`);
    bot.setControlState('sprint', false);
  } finally {
    botState.isFollowing = false;
  }
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
  try {
    // Find appropriate tool for the block
    const blockType = mcData.blocksByName[blockName];
    if (!blockType) {
      bot.chat(`I don't recognize the block type: ${blockName}`);
      return;
    }

    // Find the nearest matching block
  const block = bot.findBlock({
      matching: blockType.id,
    maxDistance: 32,
  });

  if (!block) {
    bot.chat(`I couldn't find any ${blockName} nearby.`);
    return;
  }

    // Get required tool type
    const toolRequirement = toolRequirements[blockName] || ['any'];
    let bestTool = null;

    // Find best available tool
    for (const toolName of toolRequirement) {
      const tool = bot.inventory.items().find(item => item.name.includes(toolName));
      if (tool) {
        bestTool = tool;
        break;
      }
    }

    // Equip the tool if found
    if (bestTool) {
      await bot.equip(bestTool, 'hand');
    }

    // Navigate to block if too far
    const distance = bot.entity.position.distanceTo(block.position);
    if (distance > 4) {
      bot.chat(`Moving closer to ${blockName}...`);
      await navigateToPosition(block.position);
    }

    // Look at block and dig
    await bot.lookAt(block.position);
    bot.chat(`Mining ${blockName}...`);
    await bot.dig(block);
    bot.chat(`Successfully mined ${blockName}!`);

  } catch (err) {
    console.error('Digging error:', err);
    bot.chat(`Failed to dig ${blockName}: ${err.message}`);
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
  try {
    // Stop pathfinding
    bot.pathfinder.setGoal(null);
    
    // Clear all control states
    bot.clearControlStates();
    
    // Reset all bot states
    botState.isGuarding = false;
    botState.guardTarget = null;
    botState.isFighting = false;
    botState.currentTask = null;
    botState.isFollowing = false;
    
    // Stop any movement
    bot.setControlState('forward', false);
    bot.setControlState('back', false);
    bot.setControlState('left', false);
    bot.setControlState('right', false);
    bot.setControlState('jump', false);
    bot.setControlState('sprint', false);
    
    bot.chat("Stopped all actions.");
  } catch (err) {
    console.error('Error stopping tasks:', err);
    bot.chat("Failed to stop all actions: " + err.message);
  }
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
    // Get recipe
    const recipe = bot.recipesFor(itemName)?.[0];
    if (!recipe) {
      bot.chat(`I don't know how to craft ${itemName}`);
      return;
    }

    // Check if we have a crafting table if needed
    if (recipe.requiresTable && !bot.findBlock({
      matching: block => block.name === 'crafting_table',
      maxDistance: 3
    })) {
      bot.chat("I need a crafting table. Let me look for one...");
      const craftingTable = bot.findBlock({
        matching: block => block.name === 'crafting_table',
        maxDistance: config.maxDistance
      });

      if (!craftingTable) {
        bot.chat("Couldn't find a crafting table nearby.");
        return;
      }

      await navigateToPosition(craftingTable.position);
    }

    // Attempt crafting
    await bot.craft(recipe, quantity);
    bot.chat(`Successfully crafted ${quantity} ${itemName}`);

  } catch (err) {
    console.error('Crafting error:', err);
    bot.chat(`Failed to craft ${itemName}: ${err.message}`);
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

async function storeItem(itemName, containerType = 'chest') {
  try {
    // Find nearest container
    const container = bot.findBlock({
      matching: block => block.name.includes(containerType.toLowerCase()),
      maxDistance: config.maxDistance
    });

    if (!container) {
      bot.chat(`I couldn't find any ${containerType} nearby.`);
      return;
    }

    // Move to container if too far
    const distance = bot.entity.position.distanceTo(container.position);
    if (distance > 3) {
      await navigateToPosition(container.position);
    }

    // Open container
    const chest = await bot.openContainer(container);
    
    // Find items to store
    const itemsToStore = bot.inventory.items().filter(item => 
      !itemName || item.name.includes(itemName.toLowerCase())
    );

    if (itemsToStore.length === 0) {
      bot.chat(`I don't have any ${itemName || 'items'} to store.`);
      chest.close();
      return;
    }

    // Store items
    for (const item of itemsToStore) {
      try {
        await chest.deposit(item.type, null, item.count);
        bot.chat(`Stored ${item.count} ${item.name}`);
      } catch (err) {
        bot.chat(`Failed to store ${item.name}: ${err.message}`);
      }
    }

    chest.close();
    bot.chat('Finished storing items.');

  } catch (err) {
    console.error('Storage error:', err);
    bot.chat(`Failed to store items: ${err.message}`);
  }
}

async function eatFood(forcedEat = false) {
  try {
    // Don't eat if food level is high enough, unless forced
    if (bot.food >= 20 && !forcedEat) {
      return false;
    }

    // Get all food items from inventory
    const foods = bot.inventory.items().filter(item => 
      entityCategories.food.some(foodName => item.name.includes(foodName))
    );

    if (!foods.length) {
      if (bot.food < 8) {
        bot.chat("I'm hungry but I don't have any food!");
      }
      return false;
    }

    // Sort foods by saturation/priority
    foods.sort((a, b) => {
      // Prioritize golden apples when health is low
      if (bot.health < 6) {
        if (a.name.includes('golden_apple')) return -1;
        if (b.name.includes('golden_apple')) return 1;
      }

      // Prioritize cooked foods
      const aCooked = a.name.includes('cooked');
      const bCooked = b.name.includes('cooked');
      if (aCooked && !bCooked) return -1;
      if (!aCooked && bCooked) return 1;

      return 0;
    });

    const foodToEat = foods[0];
    
    // Equip the food
    await bot.equip(foodToEat, 'hand');
    
    // Start eating
    bot.chat(`Eating ${foodToEat.name}...`);
    await bot.consume();
    
    return true;

  } catch (err) {
    console.error('Error while eating:', err);
    bot.chat("I had trouble eating: " + err.message);
    return false;
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
    // Check if it's night
    if (!bot.time.isNight) {
      bot.chat("It's not night time yet.");
      return;
    }

    // Find nearest bed
    const bed = bot.findBlock({
      matching: block => block.name.includes('bed'),
      maxDistance: config.maxDistance
    });

    if (!bed) {
      bot.chat("I couldn't find any beds nearby.");
      return;
    }

    // Navigate to bed if needed
    const distance = bot.entity.position.distanceTo(bed.position);
    if (distance > 3) {
      await navigateToPosition(bed.position);
    }

    // Try to sleep
    bot.chat("Going to sleep...");
    await bot.sleep(bed);
    bot.chat("Good night!");

    // Wake up when morning comes
    bot.on('time', async () => {
      if (bot.time.isDay && bot.isSleeping) {
        await bot.wake();
        bot.chat("Good morning!");
      }
    });

  } catch (err) {
    console.error('Sleep error:', err);
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

    botState.isGuarding = true;
    botState.guardTarget = targetEntity.target;
    bot.chat(`Guarding ${target}. I'll protect against any threats.`);

    while (botState.isGuarding) {
      // Check for nearby threats
      const nearbyEntities = Object.values(bot.entities).filter(entity => {
        if (!entity) return false;
        const distance = bot.entity.position.distanceTo(entity.position);
        return distance < 16 && entityCategories.hostile.some(type => entity.name?.includes(type));
      });

      // Sort threats by distance
      nearbyEntities.sort((a, b) => {
        const distA = bot.entity.position.distanceTo(a.position);
        const distB = bot.entity.position.distanceTo(b.position);
        return distA - distB;
      });

      // Attack nearest threat
      if (nearbyEntities.length > 0) {
        const threat = nearbyEntities[0];
        bot.chat(`Protecting against ${threat.name}!`);
        await engageInCombat(threat);
      }

      // Stay near guard target
      const distanceToTarget = bot.entity.position.distanceTo(botState.guardTarget.position);
      if (distanceToTarget > 5) {
        await navigateToPosition(botState.guardTarget.position);
      }

      // Small delay to prevent CPU overload
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  } catch (err) {
    console.error('Guard error:', err);
    bot.chat(`Failed to guard: ${err.message}`);
  } finally {
    botState.isGuarding = false;
    botState.guardTarget = null;
  }
}

async function fleeFromDanger(danger) {
  try {
    // Get danger position
    let dangerPos;
    if (danger) {
      const dangerEntity = await identifyTarget(danger);
      if (dangerEntity.target) {
        dangerPos = dangerEntity.target.position;
      }
    }

    // If no specific danger, find nearest threat
    if (!dangerPos) {
      const nearestThreat = Array.from(botState.threats)
        .sort((a, b) => {
          const distA = bot.entity.position.distanceTo(a.position);
          const distB = bot.entity.position.distanceTo(b.position);
          return distA - distB;
        })[0];
      
      if (nearestThreat) {
        dangerPos = nearestThreat.position;
      }
    }

    if (!dangerPos) {
      bot.chat("No immediate danger detected, but I'll move to a safe position.");
      // Move to random safe position
      const randomOffset = new Vec3(
        (Math.random() - 0.5) * 20,
        0,
        (Math.random() - 0.5) * 20
      );
      dangerPos = bot.entity.position.plus(randomOffset);
    }

    // Calculate escape vector (opposite direction from danger)
    const escapeVector = bot.entity.position.minus(dangerPos).normalize();
    const escapeDistance = 20; // blocks
    const escapePosition = bot.entity.position.plus(escapeVector.scaled(escapeDistance));

    // Find safe Y level
    const groundBlock = bot.findBlock({
      matching: block => block.name === 'grass_block' || block.name === 'dirt' || block.name === 'stone',
      point: escapePosition,
      maxDistance: 32,
    });

    if (groundBlock) {
      escapePosition.y = groundBlock.position.y + 1;
    }

    bot.chat("Retreating to safe position!");
    
    // Enable sprinting for faster escape
    if (bot.food > 6) {
      bot.setSprinting(true);
    }

    // Navigate to escape position
    const movements = new Movements(bot, mcData);
    movements.canDig = true; // Allow digging to escape
    movements.allowParkour = true;
    bot.pathfinder.setMovements(movements);
    
    await bot.pathfinder.goto(new goals.GoalNear(escapePosition.x, escapePosition.y, escapePosition.z, 2));
    
    bot.setSprinting(false);
    bot.chat("Reached safe position!");

  } catch (err) {
    console.error('Flee error:', err);
    bot.chat(`Failed to flee: ${err.message}`);
  }
}

// error handling
bot.on('goal_reached', (goal) => {
  console.log('Reached goal:', goal);
});

bot.on('path_update', (results) => {
  if (results.status === 'noPath') {
    console.log('No path found. Stopping current task.');
    stopAllTasks();
    bot.chat("I can't find a path to the target.");
  }
});

bot.on('path_reset', (reason) => {
  console.log('Path was reset:', reason);
});

// Load and validate configuration
function validateEnvironmentConfig() {
  try {
    // Check if .env values are still default
    const defaultValues = {
      BOT_USERNAME: 'YourBotName',
      BOT_HOST: 'localhost',
      OWNER_USERNAME: 'YourMinecraftUsername',
      GEMINI_API_KEY: 'your_api_key_here'
    };

    // Check for unconfigured values
    const unconfiguredSettings = [];
    for (const [key, defaultValue] of Object.entries(defaultValues)) {
      if (process.env[key] === defaultValue) {
        unconfiguredSettings.push(key);
      }
    }

    // Check for missing required values
    const requiredConfig = ['BOT_USERNAME', 'BOT_HOST', 'BOT_PORT', 'BOT_VERSION', 'OWNER_USERNAME', 'GEMINI_API_KEY'];
    const missingSettings = requiredConfig.filter(key => !process.env[key]);

    if (missingSettings.length > 0 || unconfiguredSettings.length > 0) {
      console.error('\x1b[31m%s\x1b[0m', '❌ Environment Configuration Error');
      console.error('\x1b[33m%s\x1b[0m', 'The .env file is not properly configured:');
      
      if (missingSettings.length > 0) {
        console.error('\x1b[31m%s\x1b[0m', '\nMissing settings:');
        missingSettings.forEach(setting => {
          console.error(`  - ${setting}`);
        });
      }

      if (unconfiguredSettings.length > 0) {
        console.error('\x1b[33m%s\x1b[0m', '\nUnconfigured settings (still using default values):');
        unconfiguredSettings.forEach(setting => {
          console.error(`  - ${setting}`);
        });
      }

      console.error('\n\x1b[36m%s\x1b[0m', 'Please configure your .env file:');
      console.error('1. Copy .env.example to .env if you haven\'t already:');
      console.error('   cp .env.example .env');
      console.error('2. Edit the .env file with your settings');
      console.error('3. Make sure all required values are set\n');

      process.exit(1);
    }

    // If validation passes, create config object
    return {
      username: process.env.BOT_USERNAME,
      host: process.env.BOT_HOST,
      port: parseInt(process.env.BOT_PORT),
      version: process.env.BOT_VERSION,
      owner: process.env.OWNER_USERNAME,
      maxDistance: parseInt(process.env.MAX_DISTANCE) || 32,
      followDistance: parseInt(process.env.FOLLOW_DISTANCE) || 2,
      reconnectTimeout: parseInt(process.env.RECONNECT_TIMEOUT) || 5000
    };
  } catch (err) {
    console.error('\x1b[31m%s\x1b[0m', '❌ Fatal Error');
    console.error('\x1b[33m%s\x1b[0m', 'Failed to load environment configuration:');
    console.error(err.message);
    console.error('\nPlease make sure:');
    console.error('1. The .env file exists');
    console.error('2. The file is readable');
    console.error('3. The syntax is correct\n');
    process.exit(1);
  }
}

// Use the validation function
const config = validateEnvironmentConfig();

// made by LqauzDev & Monderasdor

// Add new helper function
async function sayInChat(message) {
  try {
    // Remove any potential command injections
    const safeMessage = message.replace(/\//g, '');
    bot.chat(safeMessage);
  } catch (err) {
    console.error('Chat error:', err);
    bot.chat("I couldn't send that message.");
  }
}

// Resource gathering system
async function gatherResources(resourceType, quantity = 1) {
  try {
    bot.chat(`Starting to gather ${resourceType}`);
    let gathered = 0;
    
    // Define resource patterns
    const resourcePatterns = {
      'wood': ['oak_log', 'birch_log', 'spruce_log'],
      'stone': ['stone', 'cobblestone'],
      'iron': ['iron_ore'],
      'coal': ['coal_ore'],
      'food': ['wheat', 'carrot', 'potato'],
    };

    // Get specific block types to look for
    const blockTypes = resourcePatterns[resourceType.toLowerCase()] || [resourceType];
    
    while (gathered < quantity) {
      // Find nearest matching block
      const block = bot.findBlock({
        matching: blockTypes.map(type => mcData.blocksByName[type]?.id).filter(id => id),
        maxDistance: 32
      });

      if (!block) {
        bot.chat(`Can't find any more ${resourceType} nearby.`);
        break;
      }

      // Get appropriate tool
      await equipBestTool(block.name);
      
      // Move to block if needed
      const distance = bot.entity.position.distanceTo(block.position);
      if (distance > 4) {
        await navigateToPosition(block.position);
      }

      // Mine the block
      await bot.dig(block);
      gathered++;
      
      // Inventory management
      if (bot.inventory.items().length >= 32) {
        bot.chat("Inventory getting full, need to store items.");
        await storeItems();
      }
    }

    bot.chat(`Gathered ${gathered} ${resourceType}`);
  } catch (err) {
    console.error('Resource gathering error:', err);
    bot.chat(`Failed to gather resources: ${err.message}`);
  }
}

// Tool selection
async function equipBestTool(blockType) {
  const toolMappings = {
    '_log': ['_axe'],
    'stone': ['_pickaxe'],
    '_ore': ['_pickaxe'],
    'dirt': ['_shovel'],
    'sand': ['_shovel']
  };

  const toolTypes = Object.entries(toolMappings)
    .find(([block, _]) => blockType.includes(block))?.[1] || [''];

  const tools = bot.inventory.items()
    .filter(item => toolTypes.some(type => item.name.includes(type)))
    .sort((a, b) => {
      const materials = ['netherite', 'diamond', 'iron', 'stone', 'wooden'];
      return materials.indexOf(a.name.split('_')[0]) - materials.indexOf(b.name.split('_')[0]);
    });

  if (tools[0]) {
    await bot.equip(tools[0], 'hand');
  }
}

// Building system
async function buildStructure(structureType, position) {
  try {
    // Define basic structure templates
    const structures = {
      'wall': async (pos) => {
        await buildWall(pos, 5, 3); // width, height
      },
      'house': async (pos) => {
        await buildHouse(pos, 5, 5, 4); // width, length, height
      },
      'tower': async (pos) => {
        await buildTower(pos, 3, 6); // width, height
      },
      'bridge': async (pos) => {
        await buildBridge(pos, 10); // length
      }
    };

    if (!structures[structureType]) {
      bot.chat(`I don't know how to build a ${structureType}`);
      return;
    }

    bot.chat(`Starting to build ${structureType}`);
    await structures[structureType](position);
    bot.chat(`Finished building ${structureType}`);

  } catch (err) {
    console.error('Building error:', err);
    bot.chat(`Failed to build: ${err.message}`);
  }
}

// Example building function
async function buildWall(startPos, width, height) {
  const block = bot.inventory.items().find(item => 
    item.name.includes('stone') || 
    item.name.includes('planks')
  );

  if (!block) {
    bot.chat("I need building materials!");
    return;
  }

  await bot.equip(block, 'hand');

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const pos = startPos.offset(x, y, 0);
      await bot.placeBlock(block, pos);
    }
  }
}

// Update the handleDisconnect function
async function handleDisconnect() {
  if (reconnecting) return;

  reconnecting = true;
  reconnectAttempts++;

  console.log('\x1b[33m%s\x1b[0m', `⚠ Attempting to reconnect... (${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS})`);

  try {
    // Wait before attempting to reconnect
    await new Promise(resolve => setTimeout(resolve, RECONNECT_INTERVAL));

    // Create new bot instance with same config
    const newBot = mineflayer.createBot({
      host: process.env.BOT_HOST,
      port: parseInt(process.env.BOT_PORT),
      username: process.env.BOT_USERNAME,
      version: process.env.BOT_VERSION,
      auth: 'offline',
      hideErrors: true,
      checkTimeoutInterval: 60000,
      keepAlive: true
    });

    // Wait for spawn before configuring plugins
    await new Promise((resolve) => {
      newBot.once('spawn', () => {
        try {
          // Load plugins after spawn
          newBot.loadPlugin(pathfinder);
          
          // Initialize pathfinder
          const mcData = require('minecraft-data')(newBot.version);
          const movements = new Movements(newBot, mcData);
          newBot.pathfinder.setMovements(movements);
          
          // Re-register event handlers
          registerEventHandlers(newBot);
          
          // Transfer the bot reference
          Object.assign(bot, newBot);
          
          // Reset states
          botState.isGuarding = false;
          botState.isFighting = false;
          botState.isFollowing = false;
          botState.currentTask = null;
          
          reconnecting = false;
          reconnectAttempts = 0;
          
          console.log('\x1b[32m%s\x1b[0m', '✔ Successfully reconnected');
          newBot.chat("I've reconnected and am ready to help!");
          
          resolve();
        } catch (err) {
          console.error('Error during plugin initialization:', err);
          throw err;
        }
      });
    });

  } catch (err) {
    console.error('\x1b[31m%s\x1b[0m', '✘ Reconnection failed:', err.message);
    reconnecting = false;
    
    if (reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
      setTimeout(handleDisconnect, RECONNECT_INTERVAL);
    } else {
      console.error('\x1b[31m%s\x1b[0m', '✘ Max reconnection attempts reached. Shutting down.');
      process.exit(1);
    }
  }
}

// Add error handling for pathfinder initialization
bot.on('spawn', () => {
  try {
    const mcData = require('minecraft-data')(bot.version);
    const movements = new Movements(bot, mcData);
    bot.pathfinder.setMovements(movements);
  } catch (err) {
    console.error('Failed to initialize pathfinder:', err);
  }
});

// Add these new error handlers
function handleError(err) {
  console.error('\x1b[31m%s\x1b[0m', '✘ Bot error:', err);
  
  if (err.code === 'ECONNRESET' || err.code === 'ETIMEDOUT' || err.code === 'ECONNREFUSED') {
    console.log('\x1b[33m%s\x1b[0m', '⚠ Connection failed, attempting to reconnect...');
    handleDisconnect();
  } else {
    // Log unknown errors
    console.error('Unknown error:', err);
    bot.chat(`Encountered an error: ${err.message}`);
  }
}

function handleKick(reason) {
  console.log('\x1b[31m%s\x1b[0m', `✘ Bot was kicked: ${reason}`);
  
  // Check if kick was due to server shutdown
  if (reason.includes('Server closed') || reason.includes('shutdown')) {
    console.log('Server appears to be down, waiting longer before reconnect...');
    setTimeout(handleDisconnect, RECONNECT_INTERVAL * 2);
  } else {
    handleDisconnect();
  }
}

function handleEnd(reason) {
  console.log('\x1b[31m%s\x1b[0m', `✘ Bot session ended: ${reason || 'Unknown reason'}`);
  handleDisconnect();
}

function handleDeath() {
  console.log('\x1b[31m%s\x1b[0m', '✘ Bot died');
  bot.chat("I died! Waiting to respawn...");
  
  // Clear all states
  stopAllTasks();
  botState.currentTask = null;
}

function handleRespawn() {
  console.log('\x1b[32m%s\x1b[0m', '✔ Bot respawned');
  bot.chat("I've respawned and am ready to help again!");
}

function handleHealthChange() {
  // Low health warning
  if (bot.health < 8) {
    bot.chat(`Warning: My health is low (${bot.health}/20)`);
  }
  
  // Critical health emergency actions
  if (bot.health < 5) {
    emergencyActions();
  }
}

async function emergencyActions() {
  try {
    // Stop current tasks
    stopAllTasks();
    
    // Try to eat anything available
    await eatFood(true);
    
    // Try to flee if in combat
    if (botState.isFighting) {
      bot.chat("Emergency: Retreating due to low health!");
      await fleeFromDanger();
    }
  } catch (err) {
    console.error('Emergency actions failed:', err);
  }
}

// Add new guardPlayer function
async function guardPlayer(playerName) {
  try {
    const player = bot.players[playerName];
    if (!player) {
      bot.chat(`I can't find ${playerName} to guard.`);
      return;
    }

    botState.isGuarding = true;
    bot.chat(`Guarding ${playerName}. I'll protect you against any threats!`);

    while (botState.isGuarding) {
      // Check if player is still in range
      if (!player.entity) {
        bot.chat(`I lost sight of you, ${playerName}. Waiting...`);
        await new Promise(resolve => setTimeout(resolve, 1000));
        continue;
      }

      // Find nearby threats
      const nearbyThreats = Object.values(bot.entities).filter(entity => {
        if (!entity) return false;
        const distance = bot.entity.position.distanceTo(entity.position);
        return distance < 16 && (
          entityCategories.hostile.some(type => entity.name?.includes(type)) ||
          entity.type === 'mob'
        );
      });

      // Sort threats by distance
      nearbyThreats.sort((a, b) => {
        const distA = bot.entity.position.distanceTo(a.position);
        const distB = bot.entity.position.distanceTo(b.position);
        return distA - distB;
      });

      // Attack nearest threat
      if (nearbyThreats.length > 0) {
        const threat = nearbyThreats[0];
        bot.chat(`Protecting you from ${threat.name}!`);
        await engageInCombat(threat);
      }

      // Stay near player
      const distanceToPlayer = bot.entity.position.distanceTo(player.entity.position);
      if (distanceToPlayer > 3) {
        await bot.pathfinder.goto(new goals.GoalFollow(player.entity, 2));
      }

      // Look around for threats
      const yaw = (bot.entity.yaw + 0.5) % (Math.PI * 2);
      await bot.look(yaw, 0);

      // Small delay to prevent CPU overload
      await new Promise(resolve => setTimeout(resolve, 250));
    }

  } catch (err) {
    console.error('Guard error:', err);
    bot.chat(`Failed to guard ${playerName}: ${err.message}`);
  } finally {
    botState.isGuarding = false;
  }
}

// Add combat system
async function engageInCombat(target) {
  try {
    botState.isFighting = true;
    
    // Prepare for combat
    // Equip best weapon
    const weapons = bot.inventory.items().filter(item => 
      item.name.includes('sword') || item.name.includes('axe')
    ).sort((a, b) => {
      const materials = ['netherite', 'diamond', 'iron', 'stone', 'wooden'];
      const aMaterial = materials.findIndex(m => a.name.includes(m));
      const bMaterial = materials.findIndex(m => b.name.includes(m));
      return aMaterial - bMaterial;
    });

    if (weapons[0]) await bot.equip(weapons[0], 'hand');
    await equipBestArmor();

    bot.chat(`Engaging combat with ${target.name || 'enemy'}!`);

    while (target.isValid && target.health > 0 && botState.isFighting) {
      const distance = bot.entity.position.distanceTo(target.position);
      
      // Health management
      if (bot.health < 8) {
        const food = bot.inventory.items().find(item => 
          item.name.includes('golden_apple') || 
          item.name.includes('cooked')
        );
        if (food) await eatFood(food.name);
      }

      // Combat movement
      if (distance > 3) {
        await bot.pathfinder.goto(new goals.GoalFollow(target, 2));
      } else {
        // Look at target and attack
        await bot.lookAt(target.position.offset(0, target.height * 0.5, 0));
        if (bot.entity.onGround) {
          // Jump for critical hits
          bot.setControlState('jump', true);
          await bot.attack(target);
          bot.setControlState('jump', false);
        }
      }

      // Retreat if health is too low
      if (bot.health < 5) {
        botState.isFighting = false;
        await fleeFromDanger(target);
        return;
      }

      // Small delay to prevent spam
      await new Promise(resolve => setTimeout(resolve, 250));
    }

  } catch (err) {
    console.error('Combat error:', err);
    bot.chat(`Combat error: ${err.message}`);
  } finally {
    botState.isFighting = false;
    bot.setControlState('jump', false);
    bot.setControlState('sprint', false);
  }
}

// Add automatic eating checks
bot.on('physicsTick', async () => {
  // Check food level periodically
  if (bot.food <= 14) { // Start eating before getting too hungry
    await eatFood();
  }
});