

export default class Question{
    id: number;
    type: string;
    questionText: string;
    /**
     * has to be any to accept null values
     */
    options: any[];
    correctAnswer: string;
    difficulty: string;
    category: string;
    constructor(id : number, type : string, questionText : string, optionA : any, optionB : any, optionC : any, optionD : any, correctAnswer : string, difficulty : string, category : string){
        this.id = id;
        this.type = type;
        this.questionText = questionText;
        this.options = [optionA, optionB, optionC, optionD]
        this.correctAnswer = correctAnswer;
        this.difficulty = difficulty;
        this.category = category;
    }

    getID(){
        return this.id;
    }

    getType(){
        return this.type;
    }

    getQuestionText(){
        return this.questionText;
    }

    getOptions(){
        return this.options;
    }

    getCorrectAnswer(){
        return this.correctAnswer;
    }

    getDifficulty(){
        return this.difficulty;
    }

    getCategory(){
        return this.category;
    }
}