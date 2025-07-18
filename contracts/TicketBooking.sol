// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "hardhat/console.sol";

contract TicketBooking is ERC721 {
    address public immutable owner;
    IERC20 public immutable tixcoin;

    uint256 public eventIdCounter;
    uint256 public ticketIdCounter;

    struct Event {
        string name;
        uint256 date;
        uint256 price;
        uint256 totalTickets;
        uint256 soldTickets;
        uint256 refundDeadline;
    }

    struct Ticket {
        uint256 eventId;
        address owner;
        bool isCancelled;
    }

    mapping(uint256 => Event) public events;
    mapping(uint256 => Ticket) public tickets;
    mapping(address => uint256[]) public ownerBookings;

    modifier onlyOwner() {
        require(msg.sender == owner, "Only owner can perform this action");
        _;
    }

    constructor(address _tixcoinAddress) ERC721("EventTicket", "EVT") {
        owner = msg.sender;
        tixcoin = IERC20(_tixcoinAddress);
    }

    function createEvent(
        string memory _name,
        uint256 _date,
        uint256 _price,
        uint256 _totalTickets,
        uint256 _refundDeadline
    ) external onlyOwner {
        eventIdCounter++;
        events[eventIdCounter] = Event(
            _name,
            _date,
            _price,
            _totalTickets,
            0,
            _refundDeadline
        );
    }

    function withdrawFunds() external onlyOwner {
        uint256 balance = tixcoin.balanceOf(address(this));
        require(balance > 0, "No funds to withdraw");
        tixcoin.transfer(owner, balance);
    }

    function bookTicket(uint256 _eventId) external {
        Event storage currentEvent = events[_eventId];
        require(_eventId > 0 && _eventId <= eventIdCounter, "Event does not exist");
        require(currentEvent.soldTickets < currentEvent.totalTickets, "Sold out");

        bool success = tixcoin.transferFrom(msg.sender, address(this), currentEvent.price);
        require(success, "TIXCOIN transfer failed");

        currentEvent.soldTickets++;
        ticketIdCounter++;

        tickets[ticketIdCounter] = Ticket(_eventId, msg.sender, false);
        ownerBookings[msg.sender].push(ticketIdCounter);
        _safeMint(msg.sender, ticketIdCounter);
    }

    function cancelBooking(uint256 _ticketId) external {
        require(_ticketOwnerOf(_ticketId) == msg.sender, "You do not own this ticket");
        Ticket storage ticket = tickets[_ticketId];
        require(!ticket.isCancelled, "Ticket already cancelled");

        Event storage currentEvent = events[ticket.eventId];
        uint256 refundAmount;

        if (block.timestamp < currentEvent.refundDeadline) {
            refundAmount = currentEvent.price;
        } else {
            refundAmount = currentEvent.price / 2;
        }

        if (refundAmount > 0) {
            tixcoin.transfer(msg.sender, refundAmount);
        }

        ticket.isCancelled = true;
        _burn(_ticketId);
    }
    
    function getEventDetails(uint256 _eventId) external view returns (Event memory) {
        return events[_eventId];
    }
    
    function getUserTickets(address _user) external view returns (uint256[] memory) {
        return ownerBookings[_user];
    }

    function _ticketOwnerOf(uint256 _ticketId) internal view returns (address) {
        try this.ownerOf(_ticketId) returns (address ticketOwner) {
            return ticketOwner;
        } catch {
            return address(0);
        }
    }
}