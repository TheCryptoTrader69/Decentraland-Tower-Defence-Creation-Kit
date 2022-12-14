/*      ENEMY MANAGER
    handles the creation of enemy units used in the tower defence game.
    this units are reused whenever possible, even changing models between
    unit types.
*/
import { TriggerBoxShape } from "@dcl/ecs-scene-utils";
import { List, Dictionary } from "src/utilities/collections";
import { EnemyData } from "./data/enemy-data";
import { EnemyUnitObject } from "./enemy-entity";
import { GameState } from "./game-states";
export class EnemyManager extends Entity
{
    static INSTANCE:EnemyManager;

    //index for current scroll location
    iterationIndex:number;
    iterationHalt:number;

    //max allowed count of units allowed
    enemySizeMax:number = 30;
    //number of enemies in use
    enemySizeCur:number;
    //number of enemies remaining in wave
    enemySizeRemaining:number;

    //access collections
    //  list of ALL enemy unit objects
    enemyList:List<EnemyUnitObject>;
    //  dict access by unit index
    enemyDict:Dictionary<EnemyUnitObject>;
    //  sorted lists of enemy objects by type
    enemyTypeDict:Dictionary<List<EnemyUnitObject>>;

    //reusable shapes for health bars
    enemyHealthBarShapeCur:GLTFShape;
    enemyHealthBarShapeMax:GLTFShape;

    //reusable shape attached to enemies for collision
    enemyTriggerShape:TriggerBoxShape;
    //assortment of all enemy models, by type
    enemyModelDict:Dictionary<GLTFShape>;

    //required events
    UnitAttack:() => void;
    private unitAttack() { log("enemy manager callback not set - start wave"); }
    UnitDeath:(index:number) => void;
    private unitDeath(index:number) { log("enemy manager callback not set - unit death:"+index.toString()); }

    //constructor
    constructor()
    {
        super();
        EnemyManager.INSTANCE = this;

        //object
        this.addComponent(new Transform
        ({
            position: new Vector3(0,0,0),
            scale: new Vector3(1,1,1),
            rotation: new Quaternion().setEuler(0,0,0)
        }));

        //data
        this.iterationIndex = 0;
        this.iterationHalt = 0;
        this.enemySizeCur = 0;
        this.enemySizeRemaining = 0;

        //access collections
        //  enemies
        this.enemyList = new List<EnemyUnitObject>();
        this.enemyDict = new Dictionary<EnemyUnitObject>();
        //  enemies by type
        this.enemyTypeDict = new Dictionary<List<EnemyUnitObject>>();

        //health bar shape
        this.enemyHealthBarShapeCur = new GLTFShape("models/enemy/core/healthDisplayCur.glb");
        this.enemyHealthBarShapeMax = new GLTFShape("models/enemy/core/healthDisplayMax.glb");

        //trigger shape
        this.enemyTriggerShape = new TriggerBoxShape();
        //models
        this.enemyModelDict = new Dictionary<GLTFShape>();
        for(var i:number=0; i<EnemyData.length; i++)
        {
            this.enemyModelDict.addItem(i.toString(), new GLTFShape("models/enemy/"+EnemyData[i].Path+".glb"));
        }

        //set default delegates
        this.UnitAttack = this.unitAttack;
        this.UnitDeath = this.unitDeath;
    }

    //initializes the system for a new game
    Initialize()
    {
        if(GameState.EnemyDebugging) { log("enemy manager - initializing..."); }

        //pre-warm all objects
        while(this.enemyList.size() < this.enemySizeMax)
        {
            this.AddEnemyUnit();
        }

        //ensure every unit is disabled
        this.ClearUnits();
        if(GameState.EnemyDebugging) { log("enemy manager - initialized!\n\tenemy count: "+this.enemyList.size()); }
    }

    //creates a new unit, readying it to be used by this system
    AddEnemyUnit()
    {
        //create object
        const index:number = this.enemyList.size();
        const obj:EnemyUnitObject = new EnemyUnitObject(index, this.enemyHealthBarShapeCur, this.enemyHealthBarShapeMax, this.enemyTriggerShape, this.UnitAttack, this.UnitDeath);
        obj.setParent(this);
        
        //add to collections
        this.enemyList.addItem(obj);
        this.enemyDict.addItem(obj.index.toString(), obj);
    }

    //returns the next available unit
    //  optimised for large collections
    GetEnemyUnit():null|EnemyUnitObject
    {
        //reset processing index
        this.iterationHalt = this.iterationIndex;
        //push next index
        this.iterationIndex++; 
        if(this.iterationIndex >= this.enemyList.size()) { this.iterationIndex = 0; }

        //process every unit
        while(true)
        {            
            //check current units for a free unit
            if(!this.enemyList.getItem(this.iterationIndex).isAlive)
            {
                return this.enemyList.getItem(this.iterationIndex);
            }

            //exit after checking the entry index
            if(this.iterationIndex == this.iterationHalt) {return null;}

            //push next index
            this.iterationIndex++; 
            if(this.iterationIndex >= this.enemyList.size()) { this.iterationIndex = 0; }
        }
    }

    //attempts to redefines add a unit of the given type into the game, placing it in the engine and 
    //  starting its movement along the given waypoint path. this function pulls from a limited pooling
    //  of units, so it can fail if all units are in use.
    AssignEnemyUnit(type:number, wave:number):null|EnemyUnitObject
    {
        if(GameState.EnemyDebugging) { log("enemy manager - assigning new enemy of type: "+type.toString()+"..."); }
        //get object
        const obj:null|EnemyUnitObject = this.GetEnemyUnit();

        if(obj == null)
        {
            if(GameState.EnemyDebugging) { log("enemy manager - assignment failed: all units are used."); }
            return null;
        }

        //disable enemy
        obj.SetEngineState(false);

        //process shape change
        if(obj.hasComponent(GLTFShape))
        {
            //check if shape must be removed
            if(obj.type != type)
            {
                //remove shape
                obj.removeComponent(GLTFShape);
            }
        }
        if(!obj.hasComponent(GLTFShape))
        {
            //add new shape
            obj.addComponent(this.enemyModelDict.getItem(type.toString()));
        }

        //initialize with new data
        obj.Initialize(type, wave);
        this.enemySizeCur++;

        if(GameState.EnemyDebugging) { log("enemy manager - assigned new enemy!"); }
        return obj;
    }

    //deals the given amount of damage to the enemy of the given index 
    DamageUnit(index:number, damage:number)
    {
        //deal damage
        this.enemyDict.getItem(index.toString()).TakeDamage(damage);
    }

    //disables all units on the game field
    ClearUnits()
    {
        for(var i:number=0; i<this.enemyList.size(); i++)
        {
            this.ClearUnit(i);
        }
        this.enemySizeCur = 0;
        this.enemySizeRemaining = 0;
    }

    //clears the unit of the given index, removing them from the field
    ClearUnit(index:number)
    {
        //unit is not being used
        this.enemyDict.getItem(index.toString()).isAlive = false;

        //remove unit from engine
        this.enemyDict.getItem(index.toString()).SetEngineState(false);
    }
}