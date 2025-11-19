'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import Cookies from 'js-cookie';
import { Loader2, Upload, Printer, RefreshCw, Download, Info } from 'lucide-react';
import CustomDropdown from '@/components/CustomDropdown';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from '@/components/ui/pagination';
import { getUserID } from '@/utils/getFromSession';

interface DropdownOption {
  value: string;
  label: string;
}

interface ItemDetails {
  item_code: string;
  item_description: string;
  lot_no: string;
  mfg_date: string;
  exp_date: string;
  quantity: number;
  printed_quantity: number;
  remaining_quantity: number;
  print_status: string;
  uploaded_by: string;
}

interface SerialNumber {
  serialNo: string;
  qty: number;
}

interface PrinterData {
  printer_name: string;
  printer_ip: string;
  dpi: string;
}

const FGExistingDataUpload: React.FC = () => {
  const requiredHeaders = [
    'item_code',
    'item_description',
    'lot_no',
    'mfg_date',
    'exp_date',
    'quantity',
  ];
  const [file, setFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Printing State
  const [itemCodes, setItemCodes] = useState<DropdownOption[]>([]);
  const [selectedItemCode, setSelectedItemCode] = useState<string>('');
  const [lotNumbers, setLotNumbers] = useState<DropdownOption[]>([]);
  const [selectedLotNo, setSelectedLotNo] = useState<string>('');
  const [itemDetails, setItemDetails] = useState<ItemDetails | null>(null);
  const [qtyPerLabel, setQtyPerLabel] = useState<string>('');
  const [totalQty, setTotalQty] = useState<string>('');
  const [serialNumbers, setSerialNumbers] = useState<SerialNumber[]>([]);
  const [isGeneratingSerials, setIsGeneratingSerials] = useState(false);
  const [printers, setPrinters] = useState<PrinterData[]>([]);
  const [selectedPrinter, setSelectedPrinter] = useState<string>('');
  const [printerOptions, setPrinterOptions] = useState<DropdownOption[]>([]);
  const [isPrinting, setIsPrinting] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage] = useState(10);
  const [invalidFields, setInvalidFields] = useState<Set<string>>(new Set());
  const [isLoadingFile, setIsLoadingFile] = useState(false);

  const token = Cookies.get('token');

  useEffect(() => {
    fetchItemCodes();
    fetchPrinters();
  }, []);

  useEffect(() => {
    if (selectedItemCode) {
      fetchLotNumbers(selectedItemCode);
      setLotNumbers([]);
      setSelectedLotNo('');
      setItemDetails(null);
      setSerialNumbers([]);
      setQtyPerLabel('');
      setTotalQty('');
    }
  }, [selectedItemCode]);

  useEffect(() => {
    if (selectedItemCode && selectedLotNo) {
      fetchDetails(selectedItemCode, selectedLotNo);
    }
  }, [selectedLotNo]);

  const fetchItemCodes = async () => {
    try {
      const response = await fetch('/api/existing-data/get-item-codes', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await response.json();
      if (data.Status === 'T') {
        const options = data.data.map((item: any) => ({
          value: item.item_code,
          label: item.item_code,
        }));
        setItemCodes(options);
      }
    } catch (error) {
      console.error('Error fetching item codes:', error);
    }
  };

  const fetchLotNumbers = async (itemCode: string) => {
    try {
      const response = await fetch('/api/existing-data/get-lot-numbers', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ item_code: itemCode }),
      });
      const data = await response.json();
      if (data.Status === 'T') {
        const options = data.data.map((item: any) => ({
          value: item.lot_no,
          label: item.lot_no,
        }));
        setLotNumbers(options);
      }
    } catch (error) {
      console.error('Error fetching lot numbers:', error);
    }
  };

  const fetchDetails = async (itemCode: string, lotNo: string) => {
    try {
      const response = await fetch('/api/existing-data/get-details', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ item_code: itemCode, lot_no: lotNo }),
      });
      const data = await response.json();
      if (data.Status === 'T') {
        setItemDetails(data.data);
        setTotalQty(data.data.remaining_quantity.toString());
      } else {
        toast.error(data.Message || 'Failed to fetch details');
      }
    } catch (error) {
      console.error('Error fetching details:', error);
      toast.error('Error fetching details');
    }
  };

  const fetchPrinters = async () => {
    try {
      const response = await fetch(`/api/hht/printer-data`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await response.json();
      if (Array.isArray(data)) {
        setPrinters(data);
        const options = data.map((printer: any) => ({
          value: printer.printer_ip,
          label: `${printer.printer_name} - ${printer.printer_ip}`,
        }));
        setPrinterOptions(options);
      }
    } catch (error) {
      console.error('Error fetching printers:', error);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const selectedFile = e.target.files[0];
      setIsLoadingFile(true);
      
      // Simulate file loading with FileReader to show loading state
      const reader = new FileReader();
      reader.onloadstart = () => {
        setIsLoadingFile(true);
      };
      reader.onload = () => {
        setFile(selectedFile);
        setIsLoadingFile(false);
      };
      reader.onerror = () => {
        toast.error('Error reading file');
        setIsLoadingFile(false);
      };
      reader.readAsArrayBuffer(selectedFile);
    }
  };

  const handleUpload = async () => {
    if (!file) {
      toast.error('Please select a file first');
      return;
    }

    setIsUploading(true);
    const formData = new FormData();
    formData.append('excelFile', file);
    formData.append('uploaded_by', getUserID() || 'System');

    try {
      const response = await fetch('/api/existing-data/upload-excel', {
        method: 'POST',
        body: formData,
      });
      
      const data = await response.json();

      if (response.ok && data.Status === 'T') {
        toast.success(data.Message || 'File uploaded successfully');
        
        // Show detailed results if available
        if (data.results) {
          const { successCount, failureCount, totalProcessed } = data.results;
          toast.info(
            `Processed: ${totalProcessed} | Success: ${successCount} | Failed: ${failureCount}`,
            { duration: 5000 }
          );
          
          // Show failure details if any
          if (failureCount > 0 && data.results.failureData) {
            console.log('Failed rows:', data.results.failureData);
            toast.warning(`${failureCount} rows failed. Check console for details.`);
          }
        }
        
        setFile(null);
        if (fileInputRef.current) fileInputRef.current.value = '';
        fetchItemCodes(); // Refresh item codes
      } else {
        toast.error(data.Message || 'Upload failed');
      }
    } catch (error) {
      console.error('Upload error:', error);
      toast.error('Error uploading file. Please try again.');
    } finally {
      setIsUploading(false);
    }
  };

  const handleQtyPerLabelChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setQtyPerLabel(value);
    setSerialNumbers([]); // Reset serials when qty changes
  };

  const handleTotalQtyChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setTotalQty(value);
    setSerialNumbers([]);
  };

  const generateSerialNumbers = async () => {
    if (!itemDetails || !qtyPerLabel || !totalQty) {
      toast.error('Please fill all required fields');
      return;
    }

    const qtyPerLabelNum = parseFloat(qtyPerLabel);
    const totalQtyNum = parseFloat(totalQty);

    if (qtyPerLabelNum <= 0 || totalQtyNum <= 0) {
      toast.error('Quantities must be greater than 0');
      return;
    }

    if (totalQtyNum > itemDetails.remaining_quantity) {
      toast.error('Total quantity cannot exceed remaining quantity');
      return;
    }

    setIsGeneratingSerials(true);
    try {
      const response = await fetch('/api/existing-data/find-serial-number', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          item_code: selectedItemCode,
          lot_no: selectedLotNo,
        }),
      });
      const data = await response.json();

      let startSerial = 1;
      if (data.Status === 'T' && data.data) {
        startSerial = data.data.sr_no + 1;
      }

      const numLabels = Math.floor(totalQtyNum / qtyPerLabelNum);
      const remainder = totalQtyNum % qtyPerLabelNum;

      const newSerials: SerialNumber[] = [];
      for (let i = 0; i < numLabels; i++) {
        newSerials.push({
          serialNo: (startSerial + i).toString(),
          qty: qtyPerLabelNum,
        });
      }

      if (remainder > 0) {
        newSerials.push({
          serialNo: (startSerial + numLabels).toString(),
          qty: parseFloat(remainder.toFixed(3)),
        });
      }

      setSerialNumbers(newSerials);
      setCurrentPage(1);
    } catch (error) {
      console.error('Error generating serials:', error);
      toast.error('Error generating serial numbers');
    } finally {
      setIsGeneratingSerials(false);
    }
  };

  const handleSerialQtyChange = (index: number, value: string) => {
    const newQty = parseFloat(value);
    if (isNaN(newQty) || newQty < 0) return;

    const updatedSerials = [...serialNumbers];
    updatedSerials[index].qty = newQty;
    setSerialNumbers(updatedSerials);
  };

  const handlePrintLabels = async () => {
    if (serialNumbers.length === 0) {
      toast.error('No serial numbers generated');
      return;
    }
    if (!selectedPrinter) {
      toast.error('Please select a printer');
      setInvalidFields(new Set(['printer']));
      return;
    }

    const printerData = printers.find(p => p.printer_ip === selectedPrinter);
    if (!printerData) {
      toast.error('Invalid printer selected');
      return;
    }

    setIsPrinting(true);
    try {
      const serialsStr = serialNumbers.map(s => s.serialNo).join('$');
      const qtysStr = serialNumbers.map(s => s.qty).join('$');

      const payload = {
        item_code: itemDetails?.item_code,
        item_description: itemDetails?.item_description,
        lot_no: itemDetails?.lot_no,
        quantity: parseFloat(totalQty),
        uom: 'KG', // Assuming KG or fetch from master if needed, but not in details response
        serial_no: serialsStr,
        print_quantity: qtysStr,
        mfg_date: itemDetails?.mfg_date?.split('T')[0],
        exp_date: itemDetails?.exp_date?.split('T')[0],
        warehouse_code: 'WH01', // Default or from context? User didn't specify source.
        put_location: 'LOC-A-01', // Default or from context?
        print_by: getUserID() || 'Admin',
        printer_ip: selectedPrinter,
        dpi: parseInt(printerData.dpi),
      };

      const response = await fetch('/api/existing-data/insert-label-printing', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });

      const data = await response.json();

      if (data.Status === 'T') {
        toast.success(data.Message);
        // Reset form
        setSerialNumbers([]);
        setQtyPerLabel('');
        setTotalQty('');
        fetchDetails(selectedItemCode, selectedLotNo); // Refresh details
      } else {
        toast.error(data.Message || 'Printing failed');
      }
    } catch (error) {
      console.error('Printing error:', error);
      toast.error('Error printing labels');
    } finally {
      setIsPrinting(false);
    }
  };

  const downloadSampleFile = () => {
    const link = document.createElement('a');
    link.href = '/exisiting_sample_data.xlsx';
    link.download = 'exisiting_sample_data.xlsx';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Pagination
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const paginatedSerials = serialNumbers.slice(startIndex, endIndex);
  const totalPages = Math.ceil(serialNumbers.length / itemsPerPage);

  return (
    <div className="space-y-6">
      {/* Upload Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Upload className="h-5 w-5" />
              Upload Existing Data Excel
            </div>
            <div className="flex items-center gap-2">
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="outline" size="sm">
                    <Info className="mr-2 h-4 w-4" />
                    Sample Format
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Excel Upload Format</AlertDialogTitle>
                    <AlertDialogDescription>
                      Please ensure your Excel file has the following columns:
                      <br />
                      <br />
                      <strong>Required Columns:</strong>
                      <ul className="mt-2 list-disc pl-5">
                        {requiredHeaders.map(header => (
                          <li key={header}>{header}</li>
                        ))}
                      </ul>
                      <br />
                      <strong>Note:</strong> All columns are mandatory. Download
                      the sample file for reference.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <Button onClick={downloadSampleFile} variant="outline">
                      <Download className="mr-2 h-4 w-4" />
                      Download Sample
                    </Button>
                    <AlertDialogCancel>Close</AlertDialogCancel>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>

              <Button
                variant="outline"
                size="sm"
                onClick={downloadSampleFile}
              >
                <Download className="mr-2 h-4 w-4" />
                Download Sample
              </Button>
            </div>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-end gap-4">
            <div className="grid w-full max-w-sm items-center gap-1.5">
              <Label htmlFor="excel-upload">Excel File</Label>
              <Input
                id="excel-upload"
                type="file"
                accept=".xlsx, .xls"
                onChange={handleFileChange}
                ref={fileInputRef}
                disabled={isLoadingFile || isUploading}
              />
              {isLoadingFile && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  <span>Loading file...</span>
                </div>
              )}
              {file && !isLoadingFile && (
                <div className="text-sm text-muted-foreground">
                  Selected: {file.name}
                </div>
              )}
            </div>
            <Button onClick={handleUpload} disabled={isUploading || !file || isLoadingFile}>
              {isUploading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Uploading...
                </>
              ) : (
                'Upload'
              )}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Printing Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Printer className="h-5 w-5" />
            Existing Data Label Printing
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
            <div className="space-y-2">
              <Label>Item Code</Label>
              <CustomDropdown
                options={itemCodes}
                value={selectedItemCode}
                onValueChange={setSelectedItemCode}
                placeholder="Select Item Code"
                searchPlaceholder="Search item code..."
                emptyText="No item codes found"
              />
            </div>
            <div className="space-y-2">
              <Label>Lot Number</Label>
              <CustomDropdown
                options={lotNumbers}
                value={selectedLotNo}
                onValueChange={setSelectedLotNo}
                placeholder="Select Lot Number"
                searchPlaceholder="Search lot number..."
                emptyText="No lot numbers found"
                disabled={!selectedItemCode}
              />
            </div>
          </div>

          {itemDetails && (
            <>
              <div className="grid grid-cols-1 gap-4 rounded-lg bg-muted/50 p-4 md:grid-cols-2 lg:grid-cols-3">
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">
                    Description
                  </Label>
                  <div className="font-medium">
                    {itemDetails.item_description}
                  </div>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">
                    Mfg Date
                  </Label>
                  <div className="font-medium">
                    {itemDetails.mfg_date?.split('T')[0]}
                  </div>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">
                    Exp Date
                  </Label>
                  <div className="font-medium">
                    {itemDetails.exp_date?.split('T')[0]}
                  </div>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">
                    Remaining Qty
                  </Label>
                  <div className="font-medium">
                    {itemDetails.remaining_quantity}
                  </div>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">
                    Printed Qty
                  </Label>
                  <div className="font-medium">
                    {itemDetails.printed_quantity}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 items-end gap-4 md:grid-cols-3">
                <div className="space-y-2">
                  <Label>Qty Per Label</Label>
                  <Input
                    type="number"
                    value={qtyPerLabel}
                    onChange={handleQtyPerLabelChange}
                    placeholder="Enter Qty per Label"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Total Quantity</Label>
                  <Input
                    type="number"
                    value={totalQty}
                    onChange={handleTotalQtyChange}
                    placeholder="Enter Total Quantity"
                  />
                </div>
                <Button
                  onClick={generateSerialNumbers}
                  disabled={isGeneratingSerials || !qtyPerLabel || !totalQty}
                >
                  {isGeneratingSerials ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <RefreshCw className="mr-2 h-4 w-4" />
                  )}
                  Generate Serial Numbers
                </Button>
              </div>
            </>
          )}

          {serialNumbers.length > 0 && (
            <div className="space-y-4">
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Serial Number</TableHead>
                      <TableHead>Quantity</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {paginatedSerials.map((serial, index) => (
                      <TableRow key={serial.serialNo}>
                        <TableCell>{serial.serialNo}</TableCell>
                        <TableCell>
                          <Input
                            type="number"
                            value={serial.qty}
                            onChange={e =>
                              handleSerialQtyChange(
                                startIndex + index,
                                e.target.value
                              )
                            }
                            className="h-8 w-32"
                          />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              {totalPages > 1 && (
                <Pagination>
                  <PaginationContent>
                    <PaginationItem>
                      <PaginationPrevious
                        onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                        className={
                          currentPage === 1
                            ? 'pointer-events-none opacity-50'
                            : 'cursor-pointer'
                        }
                      />
                    </PaginationItem>
                    {Array.from({ length: totalPages }, (_, i) => i + 1).map(
                      page => (
                        <PaginationItem key={page}>
                          <PaginationLink
                            isActive={page === currentPage}
                            onClick={() => setCurrentPage(page)}
                            className="cursor-pointer"
                          >
                            {page}
                          </PaginationLink>
                        </PaginationItem>
                      )
                    )}
                    <PaginationItem>
                      <PaginationNext
                        onClick={() =>
                          setCurrentPage(p => Math.min(totalPages, p + 1))
                        }
                        className={
                          currentPage === totalPages
                            ? 'pointer-events-none opacity-50'
                            : 'cursor-pointer'
                        }
                      />
                    </PaginationItem>
                  </PaginationContent>
                </Pagination>
              )}

              <div className="flex items-end gap-4 border-t pt-4">
                <div className="max-w-xs flex-1 space-y-2">
                  <Label
                    className={
                      invalidFields.has('printer') ? 'text-red-500' : ''
                    }
                  >
                    Select Printer
                  </Label>
                  <CustomDropdown
                    options={printerOptions}
                    value={selectedPrinter}
                    onValueChange={val => {
                      setSelectedPrinter(val);
                      setInvalidFields(prev => {
                        const next = new Set(prev);
                        next.delete('printer');
                        return next;
                      });
                    }}
                    placeholder="Select Printer"
                    searchPlaceholder="Search printer..."
                    emptyText="No printers found"
                  />
                </div>
                <Button
                  onClick={handlePrintLabels}
                  disabled={isPrinting}
                  className="w-32"
                >
                  {isPrinting ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Printing...
                    </>
                  ) : (
                    <>
                      <Printer className="mr-2 h-4 w-4" />
                      Print
                    </>
                  )}
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default FGExistingDataUpload;
