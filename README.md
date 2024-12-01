# Altes - Minecraft most intelligent Google AI Agent Bot

A powerful Minecraft bot powered by Gemini AI that understands natural language and helps with Minecraft tasks..

how it works with just a simple poor Gemini 💩 ?

and how can it be so smart when using Gemini 1.O i mean its TRASH right 🗑️ ?


WRONG

so see the ai agent does make gemini smarter by giving him a  very advanced prompt with the data that needed for Gemini to understand Minecraft Enough. in the future we will add a dataset that make Gemini the most advanced Minecraft agent ever 

## Quick Start

```bash
# 1. Clone and install
git clone https://github.com/MONDERASDOR/Altes.git
# Unarchive
cd altes-main
npm install

# 2. Set up environment
cp .env.example .env
# Edit .env with your settings

# 3. Start the bot
node node.js
```

## Environment Setup

```env
# Required Settings
BOT_USERNAME=Altes              # Bot's username
BOT_HOST=your.server.com        # Minecraft server address
BOT_PORT=25565                  # Server port
BOT_VERSION=1.16.5             # Minecraft version
OWNER_USERNAME=YourName        # Your Minecraft username

# API Keys
GEMINI_API_KEY=your-key-here   # Get from Google AI Studio

# Optional Settings
MAX_DISTANCE=32                # Max block reach
FOLLOW_DISTANCE=2              # Following distance
RECONNECT_TIMEOUT=5000        # Reconnect delay in ms
```

## Command Reference

### Movement Commands
```
come, follow me        -> Bot follows you
goto [target]         -> Move to location/block/entity
stop                  -> Stop current action
```

### Resource Commands
```
dig [block]           -> Mine specific blocks
get [resource]        -> Find and collect resources
collect [item]        -> Pick up nearby items
```

### Combat Commands
```
attack [entity]       -> Attack specific entity
defend, protect       -> Guard mode
flee                  -> Run from danger
```

### Inventory Commands
```
drop [item] [amount]  -> Drop items
equip [item]          -> Equip item/armor
store [item]          -> Store in container
inventory             -> Show inventory
```

### Crafting Commands
```
craft [item] [amount] -> Craft items
smelt [item]         -> Use furnace
```

### Utility Commands
```
eat [food]           -> Consume food
heal                 -> Use food to heal
sleep                -> Use nearby bed
```

## Natural Language Examples

```
"Hey Altes, can you get me some wood?"
-> Bot will find and chop trees

"There's a zombie behind you!"
-> Bot turns and attacks zombie

"I need a diamond pickaxe"
-> Bot checks requirements and crafts if possible

"Let's go explore that cave"
-> Bot follows you while ready to assist
```

## Advanced Features

### Combat System
```javascript
// Bot automatically:
- Equips best weapon
- Wears available armor
- Maintains safe distance
- Retreats when low health
```

### Pathfinding
```javascript
// Features:
- Obstacle avoidance
- Parkour capable
- Sprint when safe
- Dynamic target following
```

### Inventory Management
```javascript
// Auto-organizes by:
- Tools & weapons
- Armor
- Resources
- Food
```

## Error Handling

```javascript
// Connection Issues
if (disconnected) {
    attempt_reconnect(5); // 5 retries
    increase_timeout();   // Exponential backoff
}

// Combat Retreat
if (health < 8) {
    flee_from_danger();
    seek_safety();
}

// Resource Collection
if (inventory_full) {
    notify_owner();
    await_instructions();
}
```

## Conversation Examples

```
You: "Hello Altes!"
Bot: "Hi there! How can I help you today?"

You: "What can you do?"
Bot: "I can help with mining, fighting, crafting, and more! Just let me know what you need."

You: "Thanks for helping"
Bot: "You're welcome! I enjoy our adventures together!"
```

## Common Issues & Solutions

```bash
# Connection Failed
- Check server status
- Verify port number
- Confirm version match

# Bot Not Responding
- Check OWNER_USERNAME
- Verify API key
- Ensure bot has permissions

# Command Issues
- Use natural language
- Stay within bot's range
- Check required tools
```

## Development Commands

```bash
# Start bot
node node.js

```


```json
{
  "dependencies": {
    "@google/generative-ai": "^0.21.0",
    "dotenv": "^16.0.3",
    "mineflayer": "^4.23.0",
    "mineflayer-pathfinder": "^2.4.5"
  }
}
```

## Support & Contribution

```bash
# Report Issues
- Open GitHub issue
- Provide error logs
- Describe steps to reproduce

# Contribute
- Fork repository
- Create feature branch
- Submit pull request
```

## License

MIT License - Feel free to use and modify!

---
Made by LqauzDev| Monderasdor
