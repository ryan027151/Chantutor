import SideBar from "../components/sideBar";
import TestTable from "../components/testTable";
import { useNavigate } from "react-router-dom";
import { supabase } from "../supabase-client";


function HomePage(){
    const navigate = useNavigate();

    async function MockTest() {
        const {data: { user }} = await supabase.auth.getUser();
        console.log(user)
        const { data, error } = await supabase.from("tests").insert([
        {
          user_id: user.id,
          test_name: "New Test",
          score: null,
        },
        ]);

        if (error) {
            console.error("Insert failed:", error.message);
            return;
        }

        console.log("Inserted row:", data);
        navigate("/mock");
    };
    
    return(
        <div className="flex h-screen bg-gray-200">
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
                    <button className="h-auto rounded-lg bg-blue-500 px-2 text-white text-base" onClick={MockTest}>
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