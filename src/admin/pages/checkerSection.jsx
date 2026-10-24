
//*PRIMARY NOTE: This is a new section for customerOrder menu page make this ection as tab in the 
// component card for customer order create an input field, can leave it as blank this is belong to the printed ticket but blank but they can still
// they can still input a checker name roofing, construction, hardware/TBA/chassis (column)
//after that leaving it as blank so in later they can just write down the name manually with ballpen that's the target 
//but after that sales can still add those for future updates and for future reference.

export default function CheckerSection() {
    return (
        <>
        <div classNam="checker-section">
            <div className="1stChecker">
                <input type="text" placeholder="1st Checker" />//leave it as black 
            </div>
            <div className="2ndChecker">
                <input type="text" placeholder="2nd Checker" />//leave it as blank
            </div>

        </div>
        
        
        </>
    )

}