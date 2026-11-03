// the photo at the start of a row in SheeChat's lists opens that person's profile, while the rest of the row opens the
// conversation; a button can't sit inside a button, so this one lies over the row's photo from beside it
// goes first in a .chat-list-row; person: { id, name, ... }; onProfile(person) opens theirs
export default function ProfileButton({ person, onProfile }) {
    return (
        <button
            type="button"
            className="chat-profile-btn"
            aria-label={`View ${person.name}'s profile`}
            title="View profile"
            onClick={() => onProfile(person)}
        />
    );
}
