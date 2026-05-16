import SideBar from "../components/sideBar";
import TestTable from "../components/testTable";
import { useNavigate } from "react-router-dom";
import { supabase } from "../supabase-client";
import MockTextPopUp from "../components/mockTestPopUp";
import { useState } from "react";


function HomePage(){
    const navigate = useNavigate();
    const [mockTestPopUp, setMockTestPopUp] = useState(false);
    const [tests, setTests] = useState(Map);
    const [media, setMedia] = useState(false);
    const [duration, setDuration] = useState(0);

    //Function to inianiate a mock test within supabase once you press begin on popup
    async function MockTest() {
     const { data: { user } } = await supabase.auth.getUser();

    const { data, error } = await supabase
    .from("tests")
    .insert([
      {
        user_id: user.id,
        test_name: "New Test",
        score: null,
        duration: Math.floor(duration),
        total_questions: 3,
      },
    ])
    .select() 
    .single();  

    if (error) {
        console.error("Insert failed:", error.message);
        return;
    }

    const testID = data.id;

    navigate(`/mock/${testID}`);
    }
    
    function setError(): import("react").MouseEventHandler<HTMLButtonElement> | undefined {
        throw new Error("Function not implemented.");
    }
    

    return(
        <div className="flex h-screen bg-gray-200">
            <MockTextPopUp appear={mockTestPopUp} setAppear={setMockTestPopUp}>
                        <h3 className="md:text-xl text-sm">Enter in test settings: </h3>
                        <form className="flex flex-col gap-1">
                            <label>
                                Time:
                                
                                <input type="number" className="border mx-2" required onChange={(e) => setDuration(parseInt(e.target.value))}></input>
                            </label>
                            <label>
                                # of ELA:
                                <input type="number" className="border mx-2" required></input>
                            </label>
                            <label>
                                # of Math:
                                <input type="number" className="border mx-2" required></input>
                            </label>
                        </form>
                        <button className="w-full bg-blue-200 hover:bg-blue-400 p-3 hover:text-white" onClick={MockTest}>
                            Begin
                        </button>
                    </MockTextPopUp>
            
            <div>
                <SideBar className="border-r border-gray-300 p-4"></SideBar>
            </div>

            <div className="flex flex-col md:px-16 px-8 md:py-12 py-5 gap-8 w-full ">
                
                {/* Header with Welcome + Name + TestTakeButton*/}
                <div className="flex justify-between">
                    <div className="flex flex-col gap-2">
                        <h1 className="md:text-5xl text-2xl font-bold">Welcome</h1>
                        <h3 className="md:text-xl text-sm">Name</h3>
                    </div>
                    <button className="h-auto rounded-lg bg-blue-500 px-2 text-white text-base" onClick={() => setMockTestPopUp(true)}>
                        Take New Test
                    </button>
                </div>
                <div>
                    {/*Recent test tables*/}
                    <TestTable></TestTable>
                </div>
            </div>

        </div>
    );
}

export default HomePage;