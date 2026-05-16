/**
 * structure:
 * need to first generate a valid test config
 * using this valid test config, we need to then be able to generate random questions for random subategories 
 *      need to ensure that all questions generated for first time seeing this subcategory is easy +
 *      need to track all subcategories seen + if the last time they saw this question if they got it right or wrong
 * 
 */

/**
 * this class will generate the test + track the questions done so far + the next question
 */
import Question from "./question";
import Category from "./subcategoryTracker";

export default class QuestionGenerator{
    static subCats = ["Stats_D", "R_P", "A_Eq", "P", "A_Ex", "G", "R_U", "F", "Per", "A", "L", "S", "Seq", "I"];
    testPreset: Map<string, number>;
    currentTest: Category[];
    constructor(){
        this.testPreset = this.subCatRandom();
        this.currentTest = QuestionGenerator.subCats.map(category => (new Category(category)));
    }

    randomizer(min: number, max: number){
         return Math.floor(Math.random() * (max - min + 1) ) + min;
    }

    /**
     * @returns function which returns a valid config of test questions
     */
    subCatRandom() {
        let Stats_D, R_P, A_Eq, P, A_Ex, G, R_U, F, Per, L, S, I;
        const A = 3;
        const Seq = 2;

        do {
            Stats_D = this.randomizer(7, 8);
            R_P     = this.randomizer(7, 8);
            A_Eq    = this.randomizer(6, 7);
            P       = this.randomizer(5, 7);
            A_Ex    = this.randomizer(5, 6);
            G       = this.randomizer(4, 5);
            R_U     = this.randomizer(4, 5);
            F       = this.randomizer(3, 4);
            Per     = this.randomizer(3, 4);
            L       = this.randomizer(2, 3);
            S       = this.randomizer(2, 3);
            I       = this.randomizer(1, 2);
        } while (Stats_D + R_P + A_Eq + P + A_Ex + G + R_U + F + Per + A + L + S + Seq + I !== 57);

        return new Map([
            ["Statistics And Data Analysis", Stats_D],
            ["Ratios and Proportions", R_P],
            ["Alegbra and Equations", A_Eq],
            ["Probability", P],
            ["Alegbra and Expressions", A_Ex],
            ["Geometry", G],
            ["Ratios Rate Unit Rate", R_U],
            ["Fraction Word Problem", F],
            ["Percentages", Per],
            ["Arithmetic", A],
            ["Linear Equation Formula", L],
            ["Statistics", S],
            ["Sequences", Seq],
            ["Inequalities", I]
        ]);
        }

    /**
     * this function should calculate what difficulty + category to give and not the actual question --> 
     * app will take this info avaiable sub category info + current difficulty info and actually give a question
     * @param question
     */
    questionGive(){
        let availableCategories: string[] = [];
        this.currentTest.forEach((cats) => {
            this.testPreset.forEach(function(value, key, testPreset){
                if (cats.gettotalNumQuestions() < value){
                    availableCategories.push(key)
                }
            })
        })

        let randomCategoryIndex = Math.floor(Math.random() * availableCategories.length);
        let randomCategory = availableCategories[randomCategoryIndex];

        /**
         * need to make it so that difficulty/total counter is increased for this subcategory
         */

        return randomCategory;
    }

    getTestPreset(){
        return this.testPreset;
    }

}
