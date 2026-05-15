

export default class  CategoryTracker{
    name: string;
    currentDifficulty: number;
    streak: number;
    subCatInfo: Map<string, Map<string, number>>;


    /**
     * 1 = easy
     * 2 = medium
     * 3 = hard
     * numbers are used when generating questions and thats it
     */
    constructor(name: string){
        this.name = name;
        this.currentDifficulty = 1;
        this.streak = 0;
        this.subCatInfo = new Map([
            ["easy",   new Map([["correct", 0], ["total", 0]])],
            ["medium", new Map([["correct", 0], ["total", 0]])],
            ["hard",   new Map([["correct", 0], ["total", 0]])]
        ]);
    }

    getsubCatInfo(){
        return this.subCatInfo;
    }

    getCurrentDifficulty(){
        if (this.currentDifficulty == 1){
            return "easy";
        } else if (this.currentDifficulty == 2){
            return "medium";
        } else if (this.currentDifficulty == 3){
            return "hard";
        }
    }

    /**
     * adds to difficulty and total counter of all difficulty of specific sub-category
     * @param diffculty 
     * @param correct 
     */
    addToDifficulty(diffculty: string, correct: boolean){
        const numCorrect = this.subCatInfo.get(diffculty)?.get("correct")!;
        const numTotal = this.subCatInfo.get(diffculty)?.get("total")!;
        
        this.subCatInfo.get(diffculty)?.set("total", numTotal + 1);
        
        if (correct){
            this.subCatInfo.get(diffculty)?.set("correct", numCorrect + 1);
            this.streak += 1;
            if (this.streak == 2 && this.currentDifficulty <= 2){
                this.currentDifficulty += 1; 
            };
        } else {
            this.streak = 0;
            if (this.currentDifficulty == 1){
                this.currentDifficulty = 1;
            } else {
                this.currentDifficulty - 1;
            }
        }
    }

    gettotalNumQuestions(){
        return this.subCatInfo.get("easy")?.get("total")! + this.subCatInfo.get("medium")?.get("total")! + this.subCatInfo.get("hard")?.get("total")!; 
    }
}