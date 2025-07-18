import { useState, useEffect, useCallback } from "react";
import { ethers } from "ethers";
import { CircleUserRound, Ticket, Calendar, Wallet, Landmark, Loader2, X, CheckCircle2 } from "lucide-react";

// Import ABIs and Addresses
import contractConfig from "./contract-config.json";
import TicketBookingArtifact from "./artifacts/contracts/TicketBooking.sol/TicketBooking.json";
import TixcoinArtifact from "./artifacts/contracts/TIXCOIN.sol/TIXCOIN.json";

const TICKET_BOOKING_ADDRESS = contractConfig.ticketBooking;
const TIXCOIN_ADDRESS = contractConfig.tixcoin;
const TICKET_BOOKING_ABI = TicketBookingArtifact.abi;
const TIXCOIN_ABI = TixcoinArtifact.abi;

// Helper Components
const Spinner = () => <Loader2 className="animate-spin" />;

const Notification = ({ message, type, onDismiss }) => {
  const baseClasses = "fixed top-5 right-5 p-4 rounded-lg shadow-lg flex items-center space-x-2 animate-fade-in";
  const typeClasses = type === 'success' ? 'bg-green-500 text-white' : 'bg-red-500 text-white';

  useEffect(() => {
    const timer = setTimeout(onDismiss, 3000);
    return () => clearTimeout(timer);
  }, [onDismiss]);

  return (
    <div className={`${baseClasses} ${typeClasses}`}>
      {type === 'success' ? <CheckCircle2 /> : <X />}
      <span>{message}</span>
      <button onClick={onDismiss} className="ml-4">&times;</button>
    </div>
  );
};

function App() {
  const [account, setAccount] = useState(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [provider, setProvider] = useState(null);
  const [contract, setContract] = useState(null);
  const [tixContract, setTixContract] = useState(null);
  const [tixBalance, setTixBalance] = useState("0");
  const [events, setEvents] = useState([]);
  const [userTickets, setUserTickets] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [notification, setNotification] = useState(null);

  const showNotification = (message, type = 'error') => {
    setNotification({ message, type });
  };

  const connectWallet = useCallback(async () => {
    if (!window.ethereum) {
      showNotification("MetaMask is not installed.");
      return;
    }
    try {
      setIsLoading(true);
      const web3Provider = new ethers.BrowserProvider(window.ethereum);
      setProvider(web3Provider);

      const accounts = await web3Provider.send("eth_requestAccounts", []);
      const signer = await web3Provider.getSigner();
      const currentAccount = accounts[0];
      setAccount(currentAccount);

      const bookingContract = new ethers.Contract(TICKET_BOOKING_ADDRESS, TICKET_BOOKING_ABI, signer);
      setContract(bookingContract);

      const tokenContract = new ethers.Contract(TIXCOIN_ADDRESS, TIXCOIN_ABI, signer);
      setTixContract(tokenContract);
      
      const ownerAddress = await bookingContract.owner();
      setIsAdmin(ownerAddress.toLowerCase() === currentAccount.toLowerCase());

    } catch (error) {
      console.error("Wallet connection failed:", error);
      showNotification("Failed to connect wallet.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  const fetchData = useCallback(async () => {
    if (!contract || !tixContract || !account) return;
    try {
      // Fetch balance
      const balance = await tixContract.balanceOf(account);
      setTixBalance(ethers.formatUnits(balance, 18));

      // Fetch events
      const eventCount = await contract.eventIdCounter();
      const loadedEvents = [];
      for (let i = 1; i <= eventCount; i++) {
        const eventDetails = await contract.getEventDetails(i);
        loadedEvents.push({ 
          id: i, 
          name: eventDetails.name,
          date: eventDetails.date,
          price: eventDetails.price,
          totalTickets: eventDetails.totalTickets,
          soldTickets: eventDetails.soldTickets,
          refundDeadline: eventDetails.refundDeadline
        });
      }
      setEvents(loadedEvents);
      
      // Fetch user tickets with proper error handling
      if (!isAdmin) {
        const ticketIds = await contract.getUserTickets(account);
        const loadedUserTickets = await Promise.all(
          ticketIds.map(async (ticketId) => {
            try {
              const ticketInfo = await contract.tickets(ticketId);
              const eventInfo = loadedEvents.find(e => e.id === ticketInfo.eventId) || { name: "Unknown Event" };
              await contract.ownerOf(ticketId); // Verify ticket exists
              return { 
                id: ticketId.toString(), // Convert to string immediately
                eventName: eventInfo.name,
                isCancelled: false 
              };
            } catch (e) {
              return null; // Skip invalid tickets
            }
          })
        );
        setUserTickets(loadedUserTickets.filter(t => t !== null));
      }
    } catch (error) {
      console.error("Failed to fetch data:", error);
      showNotification("Could not fetch blockchain data.");
    }
  }, [contract, tixContract, account, isAdmin]);

  useEffect(() => {
    if (contract && tixContract && account) {
      fetchData();
    }
  }, [contract, tixContract, account, fetchData]);
  
  const handleBookTicket = async (eventId, price) => {
    setIsLoading(true);
    try {
      const approveTx = await tixContract.approve(TICKET_BOOKING_ADDRESS, price);
      await approveTx.wait();
      showNotification("Approval successful!", "success");
      const bookTx = await contract.bookTicket(eventId);
      await bookTx.wait();
      showNotification("Ticket booked successfully!", "success");
      fetchData();
    } catch(err) {
      console.error(err);
      showNotification("Booking failed. Check console for details.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleCancelTicket = async (ticketId) => {
    setIsLoading(true);
    try {
      const tx = await contract.cancelBooking(ticketId);
      await tx.wait();
      showNotification("Ticket cancelled & refunded!", "success");
      fetchData();
    } catch(err) {
      console.error(err);
      showNotification("Cancellation failed. Check console.");
    } finally {
      setIsLoading(false);
    }
  };
  
  const handleCreateEvent = async (e) => {
    e.preventDefault();
    setIsLoading(true);
    const formData = new FormData(e.target);
    const data = Object.fromEntries(formData.entries());
    
    try {
      const dateTs = Math.floor(new Date(data.date).getTime() / 1000);
      const deadlineTs = Math.floor(new Date(data.deadline).getTime() / 1000);
      const priceWei = ethers.parseUnits(data.price, 18);
      
      const tx = await contract.createEvent(data.name, dateTs, priceWei, data.tickets, deadlineTs);
      await tx.wait();
      showNotification("Event created successfully!", "success");
      fetchData();
      e.target.reset();
    } catch (err) {
      console.error(err);
      showNotification("Failed to create event.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleWithdraw = async () => {
    setIsLoading(true);
    try {
      const tx = await contract.withdrawFunds();
      await tx.wait();
      showNotification("Funds withdrawn to your wallet!", "success");
    } catch (err) {
      console.error(err);
      showNotification("Withdrawal failed.");
    } finally {
      setIsLoading(false);
    }
  };
  
  return (
    <div className="min-h-screen bg-gray-900 text-gray-100 font-sans">
      {notification && <Notification {...notification} onDismiss={() => setNotification(null)} />}
      
      <header className="p-4 border-b border-gray-700">
        <div className="container mx-auto flex justify-between items-center">
          <h1 className="text-2xl font-bold text-indigo-400 flex items-center">
            <Ticket className="mr-2" /> D-Ticket
          </h1>
          {account ? (
            <div className="flex items-center space-x-4">
              <div className="text-right">
                <p className="text-sm font-mono">{`${account.substring(0,6)}...${account.substring(38)}`}</p>
                <p className={`text-xs font-bold ${isAdmin ? 'text-red-400' : 'text-green-400'}`}>
                  {isAdmin ? 'ADMIN' : 'USER'}
                </p>
              </div>
              <div className="bg-gray-800 p-2 rounded-lg flex items-center">
                <Wallet className="mr-2 h-5 w-5 text-indigo-400" />
                <span className="font-semibold">{parseFloat(tixBalance).toFixed(2)} TIX</span>
              </div>
            </div>
          ) : (
            <button 
              onClick={connectWallet} 
              disabled={isLoading} 
              className="bg-indigo-600 px-4 py-2 rounded-lg hover:bg-indigo-700 transition-colors flex items-center disabled:bg-gray-500"
            >
              {isLoading ? <Spinner /> : <><CircleUserRound className="mr-2" /> Connect Wallet</>}
            </button>
          )}
        </div>
      </header>

      <main className="container mx-auto p-4 md:p-8">
        {!account ? (
          <div className="text-center mt-20">
            <h2 className="text-4xl font-extrabold mb-4">Welcome to the Future of Ticketing</h2>
            <p className="text-gray-400 text-lg">Connect your wallet to book event tickets as NFTs.</p>
          </div>
        ) : isAdmin ? (
          <div className="animate-fade-in space-y-8">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              <form onSubmit={handleCreateEvent} className="lg:col-span-1 bg-gray-800 p-6 rounded-lg space-y-4">
                <h3 className="text-xl font-bold mb-4">Create Event</h3>
                <input name="name" type="text" placeholder="Event Name" required className="w-full p-2 bg-gray-700 rounded"/>
                <input name="date" type="datetime-local" required className="w-full p-2 bg-gray-700 rounded text-gray-400"/>
                <input name="price" type="number" placeholder="Price (TIX)" required className="w-full p-2 bg-gray-700 rounded"/>
                <input name="tickets" type="number" placeholder="Total Tickets" required className="w-full p-2 bg-gray-700 rounded"/>
                <input name="deadline" type="datetime-local" required className="w-full p-2 bg-gray-700 rounded text-gray-400"/>
                <button type="submit" disabled={isLoading} className="w-full py-2 bg-indigo-600 rounded hover:bg-indigo-700 disabled:bg-gray-500">
                  {isLoading ? <Spinner/> : "Create Event"}
                </button>
              </form>
              <div className="lg:col-span-2 bg-gray-800 p-6 rounded-lg">
                <h3 className="text-xl font-bold mb-4">Manage Events</h3>
                <div className="space-y-4 max-h-96 overflow-y-auto">
                  {events.map(e => (
                    <div key={e.id} className="bg-gray-700 p-4 rounded-md">
                      <p className="font-bold">{e.name}</p>
                      <p className="text-sm text-gray-400">
                        Date: {new Date(Number(e.date) * 1000).toLocaleString()}
                      </p>
                      <p className="text-sm text-gray-400">
                        Sold: {e.soldTickets.toString()} / {e.totalTickets.toString()}
                      </p>
                      <p className="text-sm text-indigo-300">
                        Price: {ethers.formatUnits(e.price, 18)} TIX
                      </p>
                    </div>
                  ))}
                </div>
                <button 
                  onClick={handleWithdraw} 
                  disabled={isLoading} 
                  className="mt-4 w-full py-2 bg-red-600 rounded hover:bg-red-700 disabled:bg-gray-500 flex items-center justify-center"
                >
                  {isLoading ? <Spinner /> : <><Landmark className="mr-2"/> Withdraw Funds</>}
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div className="animate-fade-in">
            <h2 className="text-3xl font-bold mb-6">Available Events</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {events.filter(e => e.soldTickets < e.totalTickets).map(e => (
                <div key={e.id} className="bg-gray-800 rounded-lg shadow-lg overflow-hidden flex flex-col">
                  <div className="p-6 flex-grow">
                    <h3 className="text-xl font-bold mb-2">{e.name}</h3>
                    <p className="flex items-center text-gray-400 mb-1">
                      <Calendar className="mr-2 h-4 w-4"/> 
                      {new Date(Number(e.date) * 1000).toLocaleString()}
                    </p>
                    <p className="flex items-center text-gray-400 mb-4">
                      <Ticket className="mr-2 h-4 w-4"/> 
                      {(e.totalTickets - e.soldTickets).toString()} seats left
                    </p>
                    <p className="text-2xl font-semibold text-indigo-400">
                      {ethers.formatUnits(e.price.toString(), 18)} TIX
                    </p>
                  </div>
                  <button 
                    onClick={() => handleBookTicket(e.id, e.price)} 
                    disabled={isLoading} 
                    className="w-full p-4 bg-indigo-600 hover:bg-indigo-700 transition-colors font-bold disabled:bg-gray-500"
                  >
                    {isLoading ? <Spinner/> : "Book Ticket"}
                  </button>
                </div>
              ))}
            </div>

            <h2 className="text-3xl font-bold mt-12 mb-6">My Tickets</h2>
            {userTickets.length === 0 ? (
              <p className="text-gray-400">You haven't booked any tickets yet.</p>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {userTickets.map(t => (
                  <div key={t.id} className="bg-gray-800 p-6 rounded-lg shadow-lg">
                    <h3 className="text-xl font-bold mb-2">{t.eventName}</h3>
                    <p className="font-mono text-sm text-gray-500 mb-4">Ticket ID: {t.id}</p>
                    <button 
                      onClick={() => handleCancelTicket(t.id)} 
                      disabled={isLoading} 
                      className="w-full py-2 bg-red-600 rounded hover:bg-red-700 disabled:bg-gray-500"
                    >
                      {isLoading ? <Spinner /> : "Cancel & Refund"}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}

export default App;