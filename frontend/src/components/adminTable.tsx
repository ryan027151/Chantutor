
export default function AdminDropdown(){
    return(
        <div>
            <label className="bg-red-500">Choose a car:</label>
            <select name="cars" id="cars">
                <option value="volvo">Volvo</option>
                <option value="saab">Saab</option>
                <option value="mercedes">Mercedes</option>
                <option value="audi">Audi</option>
            </select>
        </div>
    );
}