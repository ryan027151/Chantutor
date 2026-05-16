import AdminQuestions from "../components/adminTable";
import SideBar from "../components/sideBar";

export default function AdminPage() {
  return (
    <div className="flex w-full min-h-screen bg-gray-200">
      <SideBar className="border-r border-gray-300 p-4" />
                    
      <div className="flex flex-col md:px-16 px-8 md:py-12 py-5 m-8 gap-8 w-full">
        {/*Header*/}
        <div className="flex flex-row gap-2">
            <h2 className="md:text-2xl text-xl">Edit Mode:</h2>
            <select className="border w-auto">
                <option value="users">Users</option>
                <option value="questions">Questions</option>
            </select>
        </div>
        <div className="flex flex-col md:px-16 px-8 md:py-12 py-5 gap-8 w-full border-gray-700 shadow-xl bg-white">
            <AdminQuestions></AdminQuestions>
        </div>
      </div>
    </div>
  );
}